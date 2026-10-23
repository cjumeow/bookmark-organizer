import { readFileSync } from "node:fs";
import { createServer } from "node:http";

import { EXTENSION_ID } from "@bookmark-organizer/shared";

import { type Bridge, createBridge } from "../mcp-server/src/bridge.js";
import { expect, test } from "./fixtures.js";

const { version } = JSON.parse(readFileSync(new URL("../mcp-server/package.json", import.meta.url), "utf8")) as {
  version: string;
};

/** Made-up bookmarks, all on example.com. */
const SEED = {
  folder: "Reading",
  inFolder: [
    { title: "Example article", url: "https://example.com/article" },
    { title: "Example docs", url: "https://example.com/docs" },
  ],
  onBar: { title: "example.com", url: "https://example.com/" },
};

let bridge: Bridge | undefined;
test.afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
});

test("the extension connects, says hello and answers getTree with the seeded bookmarks", async ({
  serviceWorker,
}, testInfo) => {
  expect(serviceWorker.url()).toBe(`chrome-extension://${EXTENSION_ID}/background.js`);
  await serviceWorker.evaluate(async (seed) => {
    const [root] = await chrome.bookmarks.getTree();
    const bar = root?.children?.find((node) => node.folderType === "bookmarks-bar");
    if (bar === undefined) throw new Error("No bookmarks bar");
    const folder = await chrome.bookmarks.create({ parentId: bar.id, title: seed.folder });
    for (const bookmark of seed.inFolder) await chrome.bookmarks.create({ parentId: folder.id, ...bookmark });
    await chrome.bookmarks.create({ parentId: bar.id, ...seed.onBar });
  }, SEED);

  // The extension tried to connect when it was installed, before anything listened; it tries again on its alarm.
  bridge = createBridge({ version });
  const started = Date.now();
  const result = await bridge.request("getTree");
  console.log(`getTree answered after ${String(Date.now() - started)} ms:\n${JSON.stringify(result, null, 2)}`);
  await testInfo.attach("get-tree.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });

  expect(result).toMatchObject({
    tree: expect.arrayContaining([
      {
        id: expect.any(String),
        title: expect.any(String),
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          {
            id: expect.any(String),
            title: "Reading",
            syncing: false,
            children: SEED.inFolder.map((bookmark) => ({
              id: expect.any(String),
              syncing: false,
              ...bookmark,
            })),
          },
          { id: expect.any(String), syncing: false, ...SEED.onBar },
        ],
      },
    ]),
  });
});

test("a web page on http://localhost cannot connect to the bridge", async ({ context }) => {
  bridge = createBridge({ version });
  // Opens the listener; the extension may connect meanwhile, which does not matter here.
  bridge.request("getTree").catch(() => undefined);

  const site = createServer((_, response) => response.end("<!doctype html><title>Example</title>"));
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const { port } = site.address() as { port: number };
  try {
    const page = await context.newPage();
    await page.goto(`http://localhost:${String(port)}/`);
    const handshakeErrors: string[] = [];
    page.on("websocket", (socket) => {
      socket.on("socketerror", (error) => handshakeErrors.push(error));
    });
    // Retry until the listener is up, as a page would.
    const outcome = await page.evaluate(async () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const result = await new Promise<string>((resolve) => {
          const socket = new WebSocket("ws://127.0.0.1:47615");
          socket.onopen = () => {
            resolve("open");
          };
          socket.onclose = (event) => {
            resolve(`closed ${String(event.code)}`);
          };
        });
        if (result === "open") return result;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return "never connected";
    });
    console.log(`page's WebSocket: ${outcome}; handshake errors seen by Chromium:\n${handshakeErrors.join("\n")}`);

    expect(outcome).toBe("never connected");
    expect(handshakeErrors).toContainEqual(expect.stringContaining("403"));
  } finally {
    // The page keeps its connection to the site open, which close() would wait for.
    site.closeAllConnections();
    await new Promise((resolve) => site.close(resolve));
  }
});
