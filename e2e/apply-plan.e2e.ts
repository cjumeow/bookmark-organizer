// apply_plan as the agent calls it: the built MCP server, the built extension in Playwright's Chromium, and made-up
// bookmarks on example.com, read before and after with chrome.bookmarks in the service worker, never with get_tree.
// Where the server's side has to be watched while the extension answers, a Node WebSocket plays the extension. See
// .claude/skills/verify/features/apply-plan.md.

import { execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ChromeNode, type Operation, revisionOf, toTree } from "@bookmark-organizer/shared";
import type { BrowserContext, TestInfo, Worker } from "@playwright/test";

import { answerRequests, connectAsExtension, FakeRequestError, version } from "./fake-extension.js";
import { expect, jsonOf, type Mcp, test, textOf } from "./fixtures.js";

/** A node as the assertions compare it: no dates, no indexes, so a tree reads in order. */
type Node = { id: string; title: string; url: string } | { id: string; title: string; children: Node[] };

/** The special folders as `chrome.bookmarks` has them, read in the service worker apart from the bridge and the server. */
async function chromeTree(serviceWorker: Worker): Promise<ChromeNode[]> {
  const [root] = await serviceWorker.evaluate(() => chrome.bookmarks.getTree());
  return ChromeNode.array().parse(root?.children);
}

/** A folder's children as `chrome.bookmarks` has them now. */
async function childrenOf(serviceWorker: Worker, folderId: string): Promise<Node[]> {
  const nodes = await chromeTree(serviceWorker);
  const find = (list: ChromeNode[]): ChromeNode | undefined =>
    list.map((node) => (node.id === folderId ? node : find(node.children ?? []))).find((node) => node !== undefined);
  const compact = (node: ChromeNode): Node =>
    node.url === undefined
      ? { id: node.id, title: node.title, children: (node.children ?? []).map(compact) }
      : { id: node.id, title: node.title, url: node.url };
  return (find(nodes)?.children ?? []).map(compact);
}

/** Keeps a file of evidence in the test's folder in artifacts/e2e/, which stays after a passing run. */
async function keep(testInfo: TestInfo, name: string, body: string | Buffer, contentType: string): Promise<void> {
  const path = testInfo.outputPath(name);
  await writeFile(path, body);
  await testInfo.attach(name, { path, contentType });
}

/** Keeps the tree as Chrome has it, whole. */
async function keepTree(testInfo: TestInfo, name: string, serviceWorker: Worker): Promise<void> {
  const body = JSON.stringify(await serviceWorker.evaluate(() => chrome.bookmarks.getTree()), null, 2);
  await keep(testInfo, name, body, "application/json");
}

/** Keeps a screenshot of Chrome's own bookmark manager open at a folder. */
async function keepBookmarkManager(context: BrowserContext, testInfo: TestInfo, name: string, folderId: string) {
  const page = await context.newPage();
  await page.goto(`chrome://bookmarks/?id=${folderId}`);
  await page.waitForLoadState("networkidle");
  await keep(testInfo, name, await page.screenshot(), "image/png");
  await page.close();
}

/** The listing of the backups folder, as `ls -l` prints it, for the pull request. */
function listing(dataDir: string): string {
  const backups = join(dataDir, "backups");
  return (
    execFileSync("ls", ["-ld", backups], { encoding: "utf8" }) +
    execFileSync("ls", ["-l", backups], { encoding: "utf8" })
  );
}

async function revisionFromGetTree(mcp: Mcp): Promise<string> {
  return (jsonOf(await mcp.call("get_tree")) as { revision: string }).revision;
}

/** Seeds made-up bookmarks in the service worker and returns the special folders' IDs and titles. */
async function specialFolders(serviceWorker: Worker) {
  return serviceWorker.evaluate(async () => {
    const [root] = await chrome.bookmarks.getTree();
    const find = (type: string) => {
      const node = root?.children?.find(({ folderType }) => folderType === type);
      if (node === undefined) throw new Error(`No special folder of type ${type}`);
      return { id: node.id, title: node.title };
    };
    return { bar: find("bookmarks-bar"), other: find("other") };
  });
}

test.describe("with a Node WebSocket as the extension", () => {
  // Made-up Chrome nodes: example.com on the bookmarks bar, and an empty Other bookmarks.
  const CHROME_TREE = [
    {
      id: "1",
      title: "Bookmarks bar",
      folderType: "bookmarks-bar",
      syncing: false,
      children: [{ id: "10", title: "example.com", url: "https://example.com/", syncing: false }],
    },
    { id: "2", title: "Other bookmarks", folderType: "other", syncing: false, children: [] },
  ];
  const OPERATIONS: Operation[] = [{ op: "rename", node: "10", title: "Example: a test site" }];

  test("apply_plan writes the backup, 0600 in a 0700 folder, before it sends the operations", async ({
    mcp,
    dataDir,
  }) => {
    const revision = await revisionOf(toTree(CHROME_TREE));
    const plan = { revision, operations: OPERATIONS };
    const call = mcp.call("apply_plan", plan);
    const socket = await connectAsExtension(version);
    let seen: { params: unknown; names: string[]; folderMode: string; fileMode: string; ls: string } | undefined;
    answerRequests(socket, {
      getTree: () => ({ tree: CHROME_TREE }),
      // What the backups folder holds at the moment the extension is asked to change anything.
      applyOperations: async (params) => {
        const folder = join(dataDir, "backups");
        const names = await readdir(folder);
        const mode = async (path: string) => ((await stat(path)).mode & 0o777).toString(8);
        seen = {
          params,
          names,
          folderMode: await mode(folder),
          fileMode: await mode(join(folder, names[0] ?? "")),
          ls: listing(dataDir),
        };
        return { applied: 1, created: {}, revision: "fedcba9876543210" };
      },
    });
    const result = jsonOf(await call) as { backupId: string };
    socket.close();
    console.log(`The backups folder when applyOperations arrived:\n${seen?.ls ?? ""}`);

    expect(result).toEqual({
      backupId: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ$/),
      applied: 1,
      created: {},
      revision: "fedcba9876543210",
    });
    expect(seen).toMatchObject({
      params: { revision, operations: OPERATIONS },
      names: [`${result.backupId}.json`],
      folderMode: "700",
      fileMode: "600",
    });
    expect(JSON.parse(await readFile(join(dataDir, "backups", `${result.backupId}.json`), "utf8"))).toEqual({
      formatVersion: 1,
      id: result.backupId,
      createdAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
      version,
      revision,
      tree: toTree(CHROME_TREE),
      plan,
    });
  });

  test("apply_plan gives the backup's ID when the extension disconnects before it answers", async ({
    mcp,
    dataDir,
  }) => {
    const call = mcp.call("apply_plan", { revision: await revisionOf(toTree(CHROME_TREE)), operations: OPERATIONS });
    const socket = await connectAsExtension(version);
    answerRequests(socket, {
      getTree: () => ({ tree: CHROME_TREE }),
      applyOperations: () => {
        socket.close();
        return new Promise(() => undefined);
      },
    });
    const result = await call;
    const [backup = ""] = await readdir(join(dataDir, "backups"));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      "The extension disconnected before it answered. Some operations may have run; the backup taken before them is " +
        `${backup.replace(/\.json$/, "")}.`,
    );
  });

  test("apply_plan reports the extension's revision-mismatch as a stale plan", async ({ mcp }) => {
    const call = mcp.call("apply_plan", { revision: await revisionOf(toTree(CHROME_TREE)), operations: OPERATIONS });
    const socket = await connectAsExtension(version);
    answerRequests(socket, {
      getTree: () => ({ tree: CHROME_TREE }),
      applyOperations: () => {
        throw new FakeRequestError("revision-mismatch", "The bookmarks changed.");
      },
    });
    const result = jsonOf(await call);
    socket.close();

    expect(result).toEqual({
      valid: false,
      errors: [{ operation: -1, message: "The bookmarks changed; call get_tree again and rewrite the plan." }],
    });
  });

  test("apply_plan changes nothing when the backup cannot be written", async ({ mcp, dataDir }) => {
    // A file where the backups folder would go, so the folder cannot be created.
    await writeFile(join(dataDir, "backups"), "");
    const call = mcp.call("apply_plan", { revision: await revisionOf(toTree(CHROME_TREE)), operations: OPERATIONS });
    const socket = await connectAsExtension(version);
    const methods: string[] = [];
    socket.on("message", (data: Buffer) => {
      const { method } = JSON.parse(data.toString()) as { method?: string };
      if (method !== undefined) methods.push(method);
    });
    answerRequests(socket, { getTree: () => ({ tree: CHROME_TREE }) });
    const result = await call;
    socket.close();

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/^The backup could not be written, so nothing changed: E[A-Z]+: /);
    expect(methods).toEqual(["getTree"]);
  });
});

test("apply_plan backs up the tree, applies all four operation types, and stops at the first failure", async ({
  context,
  serviceWorker,
  mcp,
  dataDir,
}, testInfo) => {
  test.setTimeout(150_000);
  const { bar, other } = await specialFolders(serviceWorker);
  // Bookmarks bar: Reading (Example article, Example docs), example.com, Old (Example old page).
  const seeded = await serviceWorker.evaluate(async (barId) => {
    const create = (parentId: string, title: string, url?: string) =>
      chrome.bookmarks.create({ parentId, title, url }).then(({ id }) => id);
    const reading = await create(barId, "Reading");
    const article = await create(reading, "Example article", "https://example.com/article");
    const docs = await create(reading, "Example docs", "https://example.com/docs");
    const home = await create(barId, "example.com", "https://example.com/");
    const old = await create(barId, "Old");
    const oldPage = await create(old, "Example old page", "https://example.com/old");
    return { reading, article, docs, home, old, oldPage };
  }, bar.id);

  const firstRevision = await revisionFromGetTree(mcp);

  await test.step("an invalid plan returns its errors, writes no backup and changes nothing", async () => {
    const before = await chromeTree(serviceWorker);
    const result = jsonOf(
      await mcp.call("apply_plan", {
        revision: firstRevision,
        operations: [
          { op: "rename", node: seeded.home, title: "Example: a test site" },
          { op: "remove", node: seeded.reading },
        ],
      }),
    );

    expect(result).toEqual({
      valid: false,
      errors: [
        { operation: 1, message: `folder "${seeded.reading}" is not empty: move or remove what is inside it first` },
      ],
    });
    expect(await chromeTree(serviceWorker)).toEqual(before);
    await expect(stat(join(dataDir, "backups"))).rejects.toThrow("ENOENT");
  });

  let created: Record<string, string> = {};
  await test.step("a plan with all four operation types is backed up, then applied in order", async () => {
    const before = await chromeTree(serviceWorker);
    await keepTree(testInfo, "tree-before.json", serviceWorker);
    await keepBookmarkManager(context, testInfo, "bookmarks-bar-before.png", bar.id);
    const plan = {
      revision: firstRevision,
      operations: [
        { op: "create", key: "$reference", parent: other.id, title: "Reference" },
        {
          op: "create",
          key: "$page",
          parent: "$reference",
          title: "Example: a made-up page",
          url: "https://example.com/page",
          index: 0,
        },
        { op: "move", node: seeded.home, parent: "$reference" },
        { op: "move", node: seeded.docs, parent: seeded.reading, index: 0 },
        { op: "rename", node: seeded.article, title: "Example: a made-up article" },
        { op: "remove", node: seeded.oldPage },
        { op: "remove", node: seeded.old },
      ],
    };

    expect(jsonOf(await mcp.call("check_plan", plan))).toMatchObject({
      valid: true,
      summary: { foldersCreated: 1, bookmarksCreated: 1, moved: 2, renamed: 1, removed: 2 },
    });
    const result = jsonOf(await mcp.call("apply_plan", plan)) as {
      backupId: string;
      created: Record<string, string>;
      revision: string;
    };
    created = result.created;

    expect(result).toEqual({
      backupId: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ$/),
      applied: 7,
      created: { $reference: expect.stringMatching(/^\d+$/), $page: expect.stringMatching(/^\d+$/) },
      revision: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect(await childrenOf(serviceWorker, bar.id)).toEqual([
      {
        id: seeded.reading,
        title: "Reading",
        children: [
          { id: seeded.docs, title: "Example docs", url: "https://example.com/docs" },
          { id: seeded.article, title: "Example: a made-up article", url: "https://example.com/article" },
        ],
      },
    ]);
    expect(await childrenOf(serviceWorker, other.id)).toEqual([
      {
        id: created.$reference,
        title: "Reference",
        children: [
          { id: created.$page, title: "Example: a made-up page", url: "https://example.com/page" },
          { id: seeded.home, title: "example.com", url: "https://example.com/" },
        ],
      },
    ]);
    // The revision the extension reported is the one the server computes from the tree now.
    expect(await revisionFromGetTree(mcp)).toBe(result.revision);

    const backup = JSON.parse(await readFile(join(dataDir, "backups", `${result.backupId}.json`), "utf8")) as unknown;
    expect(backup).toMatchObject({ id: result.backupId, revision: firstRevision, tree: toTree(before), plan });
    const ls = listing(dataDir);
    console.log(ls);
    await keep(testInfo, "backups-ls.txt", ls, "text/plain");
    await keepTree(testInfo, "tree-after.json", serviceWorker);
    await keepBookmarkManager(context, testInfo, "bookmarks-bar-after.png", bar.id);
    await keepBookmarkManager(context, testInfo, "reference-after.png", created.$reference ?? "");
  });

  await test.step("a plan whose third operation fails keeps the first two and says which failed", async () => {
    // The person removes Example docs while the plan runs, as soon as the plan's first operation creates Inbox.
    await serviceWorker.evaluate((docsId) => {
      const removeDocs = (_id: string, node: chrome.bookmarks.BookmarkTreeNode) => {
        if (node.title !== "Inbox") return;
        chrome.bookmarks.onCreated.removeListener(removeDocs);
        void chrome.bookmarks.remove(docsId);
      };
      chrome.bookmarks.onCreated.addListener(removeDocs);
    }, seeded.docs);
    const plan = {
      revision: await revisionFromGetTree(mcp),
      operations: [
        { op: "create", key: "$inbox", parent: other.id, title: "Inbox" },
        { op: "rename", node: seeded.home, title: "Example: the home page" },
        { op: "move", node: seeded.docs, parent: "$inbox" },
        { op: "rename", node: seeded.article, title: "Example: never renamed" },
      ],
    };

    const result = jsonOf(await mcp.call("apply_plan", plan)) as { backupId: string; created: Record<string, string> };

    expect(result).toEqual({
      backupId: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ(-\d+)?$/),
      applied: 2,
      created: { $inbox: expect.stringMatching(/^\d+$/) },
      revision: expect.stringMatching(/^[0-9a-f]{16}$/),
      failed: { operation: 2, message: expect.any(String) },
    });
    expect(await childrenOf(serviceWorker, bar.id)).toEqual([
      {
        id: seeded.reading,
        title: "Reading",
        children: [{ id: seeded.article, title: "Example: a made-up article", url: "https://example.com/article" }],
      },
    ]);
    expect(await childrenOf(serviceWorker, other.id)).toEqual([
      {
        id: created.$reference,
        title: "Reference",
        children: [
          { id: created.$page, title: "Example: a made-up page", url: "https://example.com/page" },
          { id: seeded.home, title: "Example: the home page", url: "https://example.com/" },
        ],
      },
      { id: result.created.$inbox, title: "Inbox", children: [] },
    ]);
    expect((await readdir(join(dataDir, "backups"))).sort()).toContain(`${result.backupId}.json`);
    await keepTree(testInfo, "tree-after-failure.json", serviceWorker);
  });
});

test("moves and creates at an index land where check_plan's dry run says", async ({ serviceWorker, mcp }) => {
  test.setTimeout(150_000);
  const { other } = await specialFolders(serviceWorker);

  /** A new folder in Other bookmarks holding Example A, B, C and D, with their IDs by letter. */
  const folderOfFour = (title: string) =>
    serviceWorker.evaluate(
      async ({ parentId, title }) => {
        const folder = await chrome.bookmarks.create({ parentId, title });
        const ids: Record<string, string> = {};
        for (const letter of ["A", "B", "C", "D"]) {
          const url = `https://example.com/${letter.toLowerCase()}`;
          ids[letter] = (await chrome.bookmarks.create({ parentId: folder.id, title: `Example ${letter}`, url })).id;
        }
        return { folder: folder.id, ids };
      },
      { parentId: other.id, title },
    );

  // The same-folder cases of check-plan.test.ts, and creates at an index. A step moves a letter to an index, or creates
  // X at one; `order` is where every node is after the steps, as Chrome is expected to put them.
  const cases: { steps: [letter: string, index: number][]; order: string }[] = [
    { steps: [["A", 2]], order: "BACD" },
    { steps: [["A", 4]], order: "BCDA" },
    { steps: [["D", 1]], order: "ADBC" },
    { steps: [["A", 1]], order: "ABCD" },
    { steps: [["C", 0]], order: "CABD" },
    {
      steps: [
        ["A", 2],
        ["D", 1],
        ["C", 0],
      ],
      order: "CBDA",
    },
    { steps: [["X", 1]], order: "AXBCD" },
    { steps: [["X", 4]], order: "ABCDX" },
  ];

  for (const { steps, order } of cases) {
    const name = steps.map(
      ([letter, index]) => `${letter === "X" ? "create X" : `move ${letter}`} at ${String(index)}`,
    );
    await test.step(name.join(", then "), async () => {
      const { folder, ids } = await folderOfFour(name.join(", "));
      const operations = steps.map(([letter, index]): Operation => {
        if (letter === "X") return { op: "create", parent: folder, title: "Example X", index };
        return { op: "move", node: ids[letter] ?? "", parent: folder, index };
      });
      const plan = { revision: await revisionFromGetTree(mcp), operations };
      const check = jsonOf(await mcp.call("check_plan", plan)) as { changes: string[] };
      const result = jsonOf(await mcp.call("apply_plan", plan)) as { applied: number };
      const titles = (await childrenOf(serviceWorker, folder)).map(({ title }) => title);
      console.log(`check_plan: ${JSON.stringify(check.changes)}\nChrome's order after: ${titles.join(", ")}`);

      expect(result.applied).toBe(operations.length);
      expect(titles).toEqual(Array.from(order, (letter) => `Example ${letter}`));
      // The last step's line ends with where its node lands: compare it with where Chrome put it.
      const [moved = ""] = steps.at(-1) ?? [];
      const next = titles[titles.indexOf(`Example ${moved}`) + 1];
      const landing = next === undefined ? ", at the end" : `, before ${JSON.stringify(next)}`;
      expect(check.changes.at(-1)?.slice(-landing.length)).toBe(landing);
    });
  }
});
