// get_tree and check_plan as the agent calls them: the built MCP server, the built extension in Playwright's Chromium,
// and made-up bookmarks on example.com. See .claude/skills/verify/features/read-tree.md and check-plan.md.

import { EXTENSION_ID } from "@bookmark-organizer/shared";
import type { Worker } from "@playwright/test";

import { expect, jsonOf, test, textOf } from "./fixtures.js";

/** More bookmarks than fit in one tool result, so `get_tree` returns an outline: about 110 characters of JSON each. */
const ARCHIVE_SIZE = 1000;

/** The tree as `chrome.bookmarks` has it, read in the service worker apart from the bridge and the server. */
function chromeTree(serviceWorker: Worker): Promise<unknown> {
  return serviceWorker.evaluate(() => chrome.bookmarks.getTree());
}

test("get_tree reads the tree, one folder and an outline, and check_plan returns a dry run without changing anything", async ({
  serviceWorker,
  mcp,
}) => {
  test.setTimeout(150_000);
  // The server accepts only this ID, which the manifest's key fixes; a wrong one would look like Chrome being away.
  expect(serviceWorker.url()).toBe(`chrome-extension://${EXTENSION_ID}/background.js`);

  // Bookmarks bar: Reading (Example article, Example docs), example.com. The special folders' titles follow the
  // browser's language, so they are read, not written down.
  const seeded = await serviceWorker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const specials = (root?.children ?? []).map(({ id, title, folderType, syncing }) => ({
      id,
      title,
      folderType,
      syncing,
    }));
    const bar = specials.find((node) => node.folderType === "bookmarks-bar");
    const other = specials.find((node) => node.folderType === "other");
    if (bar === undefined || other === undefined) throw new Error("No bookmarks bar or Other bookmarks");
    const reading = await chrome.bookmarks.create({ parentId: bar.id, title: "Reading" });
    const article = await chrome.bookmarks.create({
      parentId: reading.id,
      title: "Example article",
      url: "https://example.com/article",
    });
    const docs = await chrome.bookmarks.create({
      parentId: reading.id,
      title: "Example docs",
      url: "https://example.com/docs",
    });
    const home = await chrome.bookmarks.create({ parentId: bar.id, title: "example.com", url: "https://example.com/" });
    return { specials, bar, other, reading: reading.id, article: article.id, docs: docs.id, home: home.id };
  });
  const { bar, other } = seeded;
  const readingFolder = {
    id: seeded.reading,
    title: "Reading",
    children: [
      { id: seeded.article, title: "Example article", url: "https://example.com/article" },
      { id: seeded.docs, title: "Example docs", url: "https://example.com/docs" },
    ],
  };

  // The extension tried to connect when it was installed, before anything listened; it connects on its next alarm.
  let firstRevision = "";
  await test.step("get_tree returns the whole tree and its revision", async () => {
    const result = jsonOf(await mcp.call("get_tree")) as { revision: string };
    expect(result).toEqual({
      revision: expect.stringMatching(/^[0-9a-f]{16}$/),
      tree: seeded.specials.map((special) => ({
        ...special,
        children:
          special.id === bar.id
            ? [readingFolder, { id: seeded.home, title: "example.com", url: "https://example.com/" }]
            : [],
      })),
    });
    firstRevision = result.revision;
  });

  await test.step("check_plan returns the dry run, and the tree is unchanged", async () => {
    const before = await chromeTree(serviceWorker);
    const result = jsonOf(
      await mcp.call("check_plan", {
        revision: firstRevision,
        operations: [
          { op: "create", key: "$reference", parent: other.id, title: "Reference" },
          { op: "move", node: seeded.home, parent: "$reference" },
          { op: "move", node: seeded.docs, parent: seeded.reading, index: 0 },
          { op: "rename", node: seeded.article, title: "Example: a made-up article" },
        ],
      }),
    );
    expect(result).toEqual({
      valid: true,
      summary: { foldersCreated: 1, bookmarksCreated: 0, moved: 2, renamed: 1, removed: 0 },
      changes: [
        `create folder "Reference" in "${other.title}"`,
        `move "example.com" from "${bar.title}" to "${other.title}/Reference"`,
        `move "Example docs" from "${bar.title}/Reading" to "${bar.title}/Reading", before "Example article"`,
        `rename "Example article" to "Example: a made-up article"`,
      ],
    });
    expect(await chromeTree(serviceWorker)).toEqual(before);
  });

  await test.step("check_plan reports every broken rule with its operation", async () => {
    const result = jsonOf(
      await mcp.call("check_plan", {
        revision: firstRevision,
        operations: [
          { op: "remove", node: seeded.reading },
          { op: "move", node: bar.id, parent: other.id },
        ],
      }),
    );
    expect(result).toEqual({
      valid: false,
      errors: [
        { operation: 0, message: `folder "${seeded.reading}" is not empty: move or remove what is inside it first` },
        { operation: 1, message: `node "${bar.id}" is a special folder, which cannot be moved` },
      ],
    });
  });

  const archive = await serviceWorker.evaluate(
    async ({ parentId, size }) => {
      const folder = await chrome.bookmarks.create({ parentId, title: "Archive" });
      for (let n = 1; n <= size; n++) {
        const number = String(n).padStart(4, "0");
        await chrome.bookmarks.create({
          parentId: folder.id,
          title: `Example page ${number}: a made-up page about nothing in particular`,
          url: `https://example.com/archive/${number}`,
        });
      }
      return folder.id;
    },
    { parentId: other.id, size: ARCHIVE_SIZE },
  );

  await test.step("get_tree returns an outline when the tree is too large", async () => {
    const response = await mcp.call("get_tree");
    expect(textOf(response).length).toBeLessThan(2_000);
    const result = jsonOf(response) as { revision: string };
    expect(result).toEqual({
      revision: expect.stringMatching(/^[0-9a-f]{16}$/),
      outline: seeded.specials.map((special) => ({
        ...special,
        bookmarkCount: special.id === bar.id ? 1 : 0,
        children:
          special.id === bar.id
            ? [{ id: seeded.reading, title: "Reading", bookmarkCount: 2, children: [] }]
            : special.id === other.id
              ? [{ id: archive, title: "Archive", bookmarkCount: ARCHIVE_SIZE, children: [] }]
              : [],
      })),
    });
    expect(result.revision).not.toBe(firstRevision);
  });

  await test.step("get_tree with a folderId returns that folder", async () => {
    const result = jsonOf(await mcp.call("get_tree", { folderId: seeded.reading }));
    expect(result).toEqual({ revision: expect.stringMatching(/^[0-9a-f]{16}$/), tree: [readingFolder] });
  });

  await test.step("get_tree with an unknown folderId says the folder does not exist", async () => {
    const result = await mcp.call("get_tree", { folderId: "999999" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Folder 999999 does not exist.");
  });

  await test.step("check_plan refuses a plan written against an older tree", async () => {
    const result = jsonOf(await mcp.call("check_plan", { revision: firstRevision, operations: [] }));
    expect(result).toEqual({
      valid: false,
      errors: [{ operation: -1, message: "The bookmarks changed; call get_tree again and rewrite the plan." }],
    });
  });
});
