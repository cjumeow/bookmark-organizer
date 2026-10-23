// The MCP server the agent connects to, its instructions and its tools, from the spec's "MCP tools" section:
// docs/spec.md#mcp-tools.

import { readFileSync } from "node:fs";

import {
  ApplyOperationsResult,
  ErrorCode,
  GetTreeResult,
  Plan,
  revisionOf,
  selectTree,
  toTree,
  type TreeNode,
} from "@bookmark-organizer/shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { BackupFile, BackupStore } from "./backups.js";
import { type Bridge, BridgeError } from "./bridge.js";
import { checkPlan, type CheckResult, STALE_PLAN, WHOLE_PLAN } from "./check-plan.js";
import { restorePlan } from "./restore-plan.js";

// package.json is the one place the version is written; dist/ and src/ both sit beside it.
export const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

/** What the agent sees beside the tools when it connects: docs/spec.md#server-instructions. */
const INSTRUCTIONS =
  "Bookmark Organizer reads and changes the person's Chrome bookmarks. Decide names and folders by the " +
  "bookmark-organizer skill. Run check_plan and show the person its changes before apply_plan, and apply only after " +
  "they agree.";

export function createServer(bridge: Bridge, backups: BackupStore): McpServer {
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

  server.registerTool(
    "apply_plan",
    {
      description:
        "Changes the Chrome bookmarks: checks the plan as check_plan does, backs up the whole tree, then runs the " +
        "operations in order. Call it only with a plan whose check_plan changes the person has seen and agreed to. " +
        "An invalid plan returns its errors, as check_plan does, and changes nothing. Otherwise returns the backup's " +
        "ID, how many operations ran, the ID Chrome gave each created node by its key, and the tree's new revision. " +
        "The operations stop at the first one that fails, with failed saying which and why; the ones before it stay " +
        "applied, and the backup holds the tree as it was before.",
      inputSchema: Plan,
      annotations: { destructiveHint: true },
    },
    async (plan) => {
      const tree = await readTree();
      const revision = await revisionOf(tree);
      const check = checkPlan(tree, revision, plan);
      if (!check.valid) return json(check);

      let backup: BackupFile;
      try {
        backup = await backups.write({ version, revision, tree, plan });
      } catch (error) {
        throw new Error(`The backup could not be written, so nothing changed: ${messageOf(error)}`, { cause: error });
      }

      try {
        const params = { revision, operations: plan.operations };
        const result = ApplyOperationsResult.parse(await bridge.request("applyOperations", params));
        return json({ backupId: backup.id, ...result });
      } catch (error) {
        // The person changed the tree after it was read here: the extension changed nothing.
        if (error instanceof BridgeError && error.code === ErrorCode.revisionMismatch) {
          const stale: CheckResult = { valid: false, errors: [{ operation: WHOLE_PLAN, message: STALE_PLAN }] };
          return json(stale);
        }
        throw new Error(
          `${messageOf(error)} Some operations may have run; the backup taken before them is ${backup.id}.`,
          { cause: error },
        );
      }
    },
  );

  server.registerTool(
    "list_backups",
    {
      description:
        "Lists the backups apply_plan took of the whole bookmark tree, newest first: each with its ID, when it was " +
        "taken, how many bookmarks and folders it holds, and how many operations the plan applied after it had. " +
        "Changes nothing.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    // The backups are files the server writes, so this needs no Chrome and does not open the bridge.
    async () => json({ backups: await backups.list() }),
  );

  server.registerTool(
    "get_restore_plan",
    {
      description:
        "Computes the plan that brings the bookmark tree back to a backup, with the current tree's revision, and " +
        "the nodes it cannot restore in skipped, each with why. Nodes that were removed are created again, with new " +
        "IDs; bookmarks added since stay, after the restored nodes. Changes nothing: check the plan with check_plan, " +
        "show the person its changes and what is skipped, and apply it with apply_plan, which backs up the tree " +
        "first, so a restore can itself be restored.",
      inputSchema: { backupId: z.string().describe("A backup's ID, from list_backups or apply_plan") },
      annotations: { readOnlyHint: true },
    },
    async ({ backupId }) => {
      // Read first, so an unknown backup is reported without waiting for Chrome.
      const backup = await backups.read(backupId);
      const tree = await readTree();
      const { operations, skipped } = restorePlan(backup.tree, tree);
      return json({ plan: { revision: await revisionOf(tree), operations }, skipped });
    },
  );

  return server;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A tool's result as compact JSON, which the outline's size limit is measured in. */
function json(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}
