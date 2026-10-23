import { revisionOf, toTree, type TreeNode } from "@bookmark-organizer/shared";
import { describe, expect, it } from "vitest";

import { applyOperations, type Bookmarks } from "./apply.js";

interface FakeNode {
  id: string;
  title: string;
  url?: string;
  children?: FakeNode[];
  folderType?: "bookmarks-bar" | "other";
  syncing: boolean;
}

/**
 * The part of `chrome.bookmarks` the applier uses, in memory: it answers and fails as Chrome does, with Chrome's own
 * messages, so the applier is tested at the system boundary. Chrome's real behavior is the end-to-end test's.
 */
function fakeBookmarks(): Bookmarks & { tree(): Promise<TreeNode[]> } {
  // Made-up bookmarks: the bar holds Example A and the folder Misc, which holds Example B; Other bookmarks is empty.
  const root: FakeNode = {
    id: "0",
    title: "",
    syncing: false,
    children: [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          { id: "10", title: "Example A", url: "https://example.com/a", syncing: false },
          {
            id: "11",
            title: "Misc",
            syncing: false,
            children: [{ id: "12", title: "Example B", url: "https://example.com/b", syncing: false }],
          },
        ],
      },
      { id: "2", title: "Other bookmarks", folderType: "other", syncing: false, children: [] },
    ],
  };
  let nextId = 100;
  const find = (id: string, node = root): FakeNode | undefined =>
    node.id === id ? node : node.children?.map((child) => find(id, child)).find((found) => found !== undefined);
  const parentOf = (node: FakeNode, from = root): FakeNode | undefined =>
    from.children?.includes(node)
      ? from
      : from.children?.map((child) => parentOf(node, child)).find((found) => found !== undefined);
  const folder = (id: string): FakeNode => {
    const found = find(id);
    if (!found?.children) throw new Error("Can't find parent bookmark for id.");
    return found;
  };
  const node = (id: string): FakeNode => {
    const found = find(id);
    if (!found || found === root) throw new Error("Can't find bookmark for id.");
    return found;
  };
  const checkIndex = (index: number | undefined, length: number) => {
    if (index !== undefined && (index < 0 || index > length)) throw new Error("Index out of bounds.");
  };

  return {
    getTree: () => Promise.resolve([structuredClone(root)]),
    async tree() {
      const [chromeRoot] = await this.getTree();
      return toTree(chromeRoot?.children);
    },
    create({ parentId, title, url, index }) {
      const parent = folder(parentId);
      const siblings = parent.children ?? [];
      checkIndex(index, siblings.length);
      const created: FakeNode = { id: String(nextId++), title, syncing: false };
      if (url === undefined) created.children = [];
      else created.url = url;
      siblings.splice(index ?? siblings.length, 0, created);
      return Promise.resolve({ id: created.id });
    },
    move(id, { parentId, index }) {
      const moving = node(id);
      const parent = folder(parentId);
      const from = parentOf(moving);
      const siblings = parent.children ?? [];
      checkIndex(index, siblings.length);
      const oldIndex = from?.children?.indexOf(moving) ?? -1;
      from?.children?.splice(oldIndex, 1);
      let at = index ?? siblings.length;
      if (from === parent && at > oldIndex) at--;
      siblings.splice(at, 0, moving);
      return Promise.resolve({});
    },
    update(id, { title }) {
      node(id).title = title;
      return Promise.resolve({});
    },
    remove(id) {
      const removing = node(id);
      if (removing.children?.length) throw new Error("Can't remove non-empty folder (use recursive to force).");
      const from = parentOf(removing);
      from?.children?.splice(from.children.indexOf(removing), 1);
      return Promise.resolve();
    },
  };
}

describe("applyOperations", () => {
  it("runs the operations in order and answers how many ran and the revision of the tree after them", async () => {
    const bookmarks = fakeBookmarks();
    const revision = await revisionOf(await bookmarks.tree());

    const result = await applyOperations(bookmarks, revision, [
      { op: "move", node: "12", parent: "1", index: 0 },
      // Misc is empty only once Example B has moved out of it.
      { op: "remove", node: "11" },
      { op: "rename", node: "10", title: "Example: a test site" },
    ]);

    const after: TreeNode[] = [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          { id: "12", title: "Example B", url: "https://example.com/b" },
          { id: "10", title: "Example: a test site", url: "https://example.com/a" },
        ],
      },
      { id: "2", title: "Other bookmarks", folderType: "other", syncing: false, children: [] },
    ];
    expect(await bookmarks.tree()).toEqual(after);
    expect(result).toEqual({ applied: 3, created: {}, revision: await revisionOf(after) });
  });

  it("replaces each key with the ID Chrome gave its node, in later operations and in created", async () => {
    const bookmarks = fakeBookmarks();
    const revision = await revisionOf(await bookmarks.tree());

    const result = await applyOperations(bookmarks, revision, [
      { op: "create", key: "$reference", parent: "2", title: "Reference" },
      { op: "move", node: "10", parent: "$reference" },
      {
        op: "create",
        key: "$docs",
        parent: "$reference",
        title: "Example docs",
        url: "https://example.com/docs",
        index: 0,
      },
      { op: "rename", node: "$docs", title: "Example: made-up docs" },
    ]);

    expect(result.created).toEqual({ $reference: "100", $docs: "101" });
    expect((await bookmarks.tree())[1]).toEqual({
      id: "2",
      title: "Other bookmarks",
      folderType: "other",
      syncing: false,
      children: [
        {
          id: "100",
          title: "Reference",
          children: [
            { id: "101", title: "Example: made-up docs", url: "https://example.com/docs" },
            { id: "10", title: "Example A", url: "https://example.com/a" },
          ],
        },
      ],
    });
  });

  it("stops at the first operation that fails, keeps the ones before it, and says which failed and why", async () => {
    const bookmarks = fakeBookmarks();
    const revision = await revisionOf(await bookmarks.tree());

    const result = await applyOperations(bookmarks, revision, [
      { op: "create", key: "$reference", parent: "2", title: "Reference" },
      { op: "rename", node: "10", title: "Example: a test site" },
      // Not in the tree, as when the person removed it while the plan ran.
      { op: "move", node: "99", parent: "$reference" },
      { op: "move", node: "12", parent: "$reference" },
    ]);

    const after: TreeNode[] = [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          { id: "10", title: "Example: a test site", url: "https://example.com/a" },
          { id: "11", title: "Misc", children: [{ id: "12", title: "Example B", url: "https://example.com/b" }] },
        ],
      },
      {
        id: "2",
        title: "Other bookmarks",
        folderType: "other",
        syncing: false,
        children: [{ id: "100", title: "Reference", children: [] }],
      },
    ];
    expect(await bookmarks.tree()).toEqual(after);
    expect(result).toEqual({
      applied: 2,
      created: { $reference: "100" },
      revision: await revisionOf(after),
      failed: { operation: 2, message: "Can't find bookmark for id." },
    });
  });

  it("answers revision-mismatch and changes nothing when the tree is not the one the plan was checked against", async () => {
    const bookmarks = fakeBookmarks();
    const checked = await revisionOf(await bookmarks.tree());
    // The person renames a bookmark after the server checked the plan.
    await bookmarks.update("12", { title: "Example B, renamed by the person" });
    const before = await bookmarks.tree();

    const applying = applyOperations(bookmarks, checked, [{ op: "remove", node: "10" }]);

    await expect(applying).rejects.toMatchObject({
      code: "revision-mismatch",
      message: "The bookmarks changed; call get_tree again and rewrite the plan.",
    });
    expect(await bookmarks.tree()).toEqual(before);
  });

  it("runs a second plan only after the first, so a plan checked against the tree before the first is refused", async () => {
    const bookmarks = fakeBookmarks();
    const revision = await revisionOf(await bookmarks.tree());

    const [first, second] = await Promise.allSettled([
      applyOperations(bookmarks, revision, [{ op: "rename", node: "10", title: "Example: first" }]),
      applyOperations(bookmarks, revision, [{ op: "rename", node: "10", title: "Example: second" }]),
    ]);

    expect(first).toMatchObject({ status: "fulfilled", value: { applied: 1 } });
    expect(second).toMatchObject({ status: "rejected", reason: { code: "revision-mismatch" } });
    const [bar] = await bookmarks.tree();
    expect(bar && "children" in bar ? bar.children[0] : bar).toMatchObject({ id: "10", title: "Example: first" });
  });
});
