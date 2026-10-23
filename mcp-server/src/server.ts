// The MCP server the agent connects to, its instructions and its tools, from the spec's "MCP tools" section:
// docs/spec.md#mcp-tools.

import { readFileSync } from "node:fs";

import { GetTreeResult, Plan, revisionOf, selectTree, toTree, type TreeNode } from "@bookmark-organizer/shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { Bridge } from "./bridge.js";
import { checkPlan } from "./check-plan.js";

// package.json is the one place the version is written; dist/ and src/ both sit beside it.
export const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

/** What the agent sees beside the tools when it connects: docs/spec.md#server-instructions. */
const INSTRUCTIONS =
  "Bookmark Organizer reads and changes the person's Chrome bookmarks. Decide names and folders by the " +
  "bookmark-organizer skill. Run check_plan and show the person its changes before apply_plan, and apply only after " +
  "they agree.";

export function createServer(bridge: Bridge): McpServer {
  const server = new McpServer({ name: "bookmark-organizer", version }, { instructions: INSTRUCTIONS });

  /** The tree as it is now: the server holds no bookmark state, so every tool reads it fresh from the extension. */
  async function readTree(): Promise<TreeNode[]> {
    return toTree(GetTreeResult.parse(await bridge.request("getTree")).tree);
  }

  // A tool that throws returns an MCP error result whose text is the error's message, so the bridge's errors and an
  // unknown folder reach the agent in the words of docs/spec.md#errors.

  server.registerTool(
    "get_tree",
    {
      description:
        "Reads the Chrome bookmark tree, with the revision a plan must carry. The top level is the special folders, " +
        "each with its folderType and its storage (syncing: true for account storage). With folderId, returns only " +
        "that folder and what is inside it; the revision still covers the whole tree. When the result would be too " +
        "large, returns an outline instead: the folders with how many bookmarks each holds directly, and no " +
        "bookmarks; then read it one folder at a time with folderId. Changes nothing.",
      inputSchema: {
        folderId: z.string().optional().describe("A folder's ID, to read only that folder and what is inside it"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ folderId }) => json(await selectTree(await readTree(), folderId)),
  );

  server.registerTool(
    "check_plan",
    {
      description:
        "Checks a plan against the current bookmark tree and returns its dry run: a summary and one line per " +
        "operation, in words to show the person before apply_plan. An invalid plan returns every broken rule " +
        "instead, each with the index of its operation (-1 for the whole plan, such as a stale revision). " +
        "Operations run in order, so each sees the tree as the operations before it left it. Changes nothing.",
      inputSchema: Plan,
      annotations: { readOnlyHint: true },
    },
    async (plan) => {
      const tree = await readTree();
      return json(checkPlan(tree, await revisionOf(tree), plan));
    },
  );

  return server;
}

/** A tool's result as compact JSON, which the outline's size limit is measured in. */
function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}
