// Playwright fixtures for the end-to-end tests: Playwright's own Chromium with the built extension loaded, in a
// temporary profile that is removed afterwards, and the built MCP server driven by the MCP SDK's client, as an agent
// drives it, with a temporary data folder for its backups. Never the developer's Chrome, profile, bookmarks or data
// folder.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type BrowserContext, chromium, test as base, type Worker } from "@playwright/test";

const EXTENSION_DIR = fileURLToPath(new URL("../extension/dist", import.meta.url));
const SERVER = fileURLToPath(new URL("../mcp-server/dist/index.js", import.meta.url));

/** The built MCP server, connected over stdio. */
export interface Mcp {
  client: Client;
  /** Calls a tool and records the request and the response in the test's MCP transcript. */
  call(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
}

export const test = base.extend<{ context: BrowserContext; serviceWorker: Worker; dataDir: string; mcp: Mcp }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern.
  context: async ({}, use) => {
    const profileDir = await mkdtemp(join(tmpdir(), "bookmark-organizer-e2e-"));
    const context = await chromium.launchPersistentContext(profileDir, {
      // The full Chromium in its new headless mode, which loads extensions; the headless shell does not.
      channel: "chromium",
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    try {
      await use(context);
    } finally {
      await context.close();
      await rm(profileDir, { recursive: true, force: true });
    }
  },

  /** The extension's service worker, where `chrome.bookmarks` can be called directly. */
  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(worker);
  },

  /** A temporary folder the server keeps its backups in, as BOOKMARK_ORGANIZER_DATA_DIR; removed afterwards. */
  // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern.
  dataDir: async ({}, use) => {
    const dataDir = await mkdtemp(join(tmpdir(), "bookmark-organizer-e2e-data-"));
    try {
      await use(dataDir);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  },

  /** The built server, started as Claude Code starts it; closing the client ends it and frees the bridge's port. */
  mcp: async ({ dataDir }, use, testInfo) => {
    const client = new Client({ name: "bookmark-organizer-e2e", version: "0.0.0" });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [SERVER],
        env: { ...getDefaultEnvironment(), BOOKMARK_ORGANIZER_DATA_DIR: dataDir },
      }),
    );
    const transcript: string[] = [];
    const record = (line: string) => {
      transcript.push(line);
      console.log(line);
    };
    try {
      await use({
        client,
        async call(name, args = {}) {
          const params = { name, arguments: args };
          record(`→ tools/call ${JSON.stringify(params)}`);
          const started = Date.now();
          // Longer than the 40 seconds the bridge waits for the extension, so the tool's own error comes back.
          const result = (await client.callTool(params, undefined, { timeout: 80_000 })) as CallToolResult;
          record(`← after ${String(Date.now() - started)} ms: ${JSON.stringify(result)}`);
          return result;
        },
      });
    } finally {
      await client.close();
      // Written to the test's folder, so the transcript stays in artifacts/e2e/ after a passing run too.
      const path = testInfo.outputPath("mcp-transcript.txt");
      await writeFile(path, transcript.join("\n"));
      await testInfo.attach("mcp-transcript.txt", { path, contentType: "text/plain" });
    }
  },
});

/** The text of a tool result, which holds its JSON or its error. */
export function textOf(result: CallToolResult): string {
  const [content] = result.content;
  if (content?.type !== "text") throw new Error(`Expected one text content, got ${JSON.stringify(result.content)}`);
  return content.text;
}

/** The JSON a tool returned, after checking it is not an error result. */
export function jsonOf(result: CallToolResult): unknown {
  if (result.isError) throw new Error(`The tool returned an error: ${textOf(result)}`);
  return JSON.parse(textOf(result));
}

export { expect } from "@playwright/test";
