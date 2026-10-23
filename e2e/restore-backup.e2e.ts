// Restoring a backup as the agent does it: list_backups, get_restore_plan, check_plan and apply_plan on the built MCP
// server and the built extension in Playwright's Chromium, with made-up bookmarks on example.com, read before and after
// with chrome.bookmarks in the service worker. See .claude/skills/verify/features/restore-backup.md.

import { writeFile } from "node:fs/promises";

import { ChromeNode, toTree, type TreeNode } from "@bookmark-organizer/shared";
import type { TestInfo, Worker } from "@playwright/test";

import { expect, jsonOf, type Mcp, test } from "./fixtures.js";

/** The tree as `chrome.bookmarks` has it, read in the service worker apart from the bridge and the server. */
async function treeInChrome(serviceWorker: Worker): Promise<TreeNode[]> {
  const [root] = await serviceWorker.evaluate(() => chrome.bookmarks.getTree());
  return toTree(ChromeNode.array().parse(root?.children));
}

/** Keeps a file of evidence in the test's folder in artifacts/e2e/, which stays after a passing run. */
async function keep(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  const path = testInfo.outputPath(name);
  await writeFile(path, JSON.stringify(value, null, 2));
  await testInfo.attach(name, { path, contentType: "application/json" });
}

/** A tree with every ID that `ids` maps replaced, for the nodes a restore created again. */
function withIds(tree: TreeNode[], ids: Record<string, string>): TreeNode[] {
  return tree.map((node) => {
    const id = ids[node.id] ?? node.id;
    return "children" in node ? { ...node, id, children: withIds(node.children, ids) } : { ...node, id };
  });
}

interface ApplyResult {
  backupId: string;
  applied: number;
  created: Record<string, string>;
  revision: string;
}

async function apply(mcp: Mcp, plan: Record<string, unknown>): Promise<ApplyResult> {
  expect(jsonOf(await mcp.call("check_plan", plan))).toMatchObject({ valid: true });
  return jsonOf(await mcp.call("apply_plan", plan)) as ApplyResult;
}

test("a backup is restored through get_restore_plan, check_plan and apply_plan, and the restore is backed up too", async ({
  serviceWorker,
  mcp,
}, testInfo) => {
  test.setTimeout(150_000);
  // Bookmarks bar: Reading (Example article, Example docs), example.com, Old (Example old page).
  const seeded = await serviceWorker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const bar = root?.children?.find(({ folderType }) => folderType === "bookmarks-bar")?.id ?? "";
    const other = root?.children?.find(({ folderType }) => folderType === "other")?.id ?? "";
    const create = (parentId: string, title: string, url?: string) =>
      chrome.bookmarks.create({ parentId, title, url }).then(({ id }) => id);
    const reading = await create(bar, "Reading");
    const article = await create(reading, "Example article", "https://example.com/article");
    const docs = await create(reading, "Example docs", "https://example.com/docs");
    const home = await create(bar, "example.com", "https://example.com/");
    const old = await create(bar, "Old");
    const oldPage = await create(old, "Example old page", "https://example.com/old");
    return { bar, other, reading, article, docs, home, old, oldPage };
  });
  const original = await treeInChrome(serviceWorker);
  await keep(testInfo, "tree-original.json", original);

  // A reorganization that changes the tree every way a plan can.
  const { revision } = jsonOf(await mcp.call("get_tree")) as { revision: string };
  const reorganized = await apply(mcp, {
    revision,
    operations: [
      { op: "create", key: "$reference", parent: seeded.other, title: "Reference" },
      { op: "move", node: seeded.home, parent: "$reference" },
      { op: "move", node: seeded.docs, parent: seeded.reading, index: 0 },
      { op: "rename", node: seeded.article, title: "Example: a made-up article" },
      { op: "remove", node: seeded.oldPage },
      { op: "remove", node: seeded.old },
    ],
  });
  expect(reorganized.applied).toBe(6);
  await keep(testInfo, "tree-reorganized.json", await treeInChrome(serviceWorker));

  const listed = jsonOf(await mcp.call("list_backups")) as { backups: { id: string }[] };
  expect(listed).toEqual({
    backups: [{ id: reorganized.backupId, createdAt: expect.any(String), bookmarks: 4, folders: 2, operations: 6 }],
  });

  const restore = jsonOf(await mcp.call("get_restore_plan", { backupId: reorganized.backupId })) as {
    plan: { revision: string; operations: unknown[] };
    skipped: unknown[];
  };
  await keep(testInfo, "restore-plan.json", restore);
  expect(restore).toEqual({
    plan: {
      revision: reorganized.revision,
      operations: [
        { op: "move", node: seeded.article, parent: seeded.reading, index: 0 },
        { op: "rename", node: seeded.article, title: "Example article" },
        { op: "move", node: seeded.home, parent: seeded.bar, index: 1 },
        { op: "create", key: `$restore-${seeded.old}`, parent: seeded.bar, title: "Old", index: 2 },
        {
          op: "create",
          key: `$restore-${seeded.oldPage}`,
          parent: `$restore-${seeded.old}`,
          title: "Example old page",
          url: "https://example.com/old",
          index: 0,
        },
        { op: "remove", node: reorganized.created.$reference },
      ],
    },
    skipped: [],
  });
  const check = jsonOf(await mcp.call("check_plan", restore.plan));
  console.log(`check_plan of the restore plan: ${JSON.stringify(check, null, 2)}`);

  const restored = await apply(mcp, restore.plan);
  const after = await treeInChrome(serviceWorker);
  await keep(testInfo, "tree-restored.json", after);

  // The backup's tree, but for the IDs Chrome gave the nodes it created again.
  const newIds = {
    [seeded.old]: restored.created[`$restore-${seeded.old}`] ?? "",
    [seeded.oldPage]: restored.created[`$restore-${seeded.oldPage}`] ?? "",
  };
  expect(after).toEqual(withIds(original, newIds));

  const backups = jsonOf(await mcp.call("list_backups"));
  console.log(`list_backups after the restore: ${JSON.stringify(backups, null, 2)}`);
  await keep(testInfo, "list-backups.json", backups);
  expect(backups).toEqual({
    backups: [
      { id: restored.backupId, createdAt: expect.any(String), bookmarks: 3, folders: 2, operations: 6 },
      { id: reorganized.backupId, createdAt: expect.any(String), bookmarks: 4, folders: 2, operations: 6 },
    ],
  });

  // The restore's own backup holds the reorganized tree, so restoring it undoes the restore.
  const undo = jsonOf(await mcp.call("get_restore_plan", { backupId: restored.backupId })) as {
    plan: { operations: unknown[] };
    skipped: unknown[];
  };
  expect(undo.skipped).toEqual([]);
  expect(undo.plan.operations.length).toBeGreaterThan(0);
  expect(jsonOf(await mcp.call("check_plan", undo.plan))).toMatchObject({ valid: true });
});
