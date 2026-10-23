// What crosses the bridge between the MCP server and the extension, from the spec's "Bridge" section:
// docs/spec.md#bridge. Both ends parse what they receive with these schemas.

import { z } from "zod";

import { ChromeNode } from "./chrome-node.js";
import { Operation } from "./plan.js";

/** The port the MCP server listens on and the extension connects to, on 127.0.0.1. */
export const BRIDGE_PORT = 47615;

/**
 * The extension's ID, which Chrome derives from the `key` in extension/manifest.json, so it is the same in every
 * checkout. A test in mcp-server checks the two agree.
 */
export const EXTENSION_ID = "ancijliidboahicggjggbhlflehlnbjg";

/** The WebSocket close codes the server sends. */
export const CloseCode = {
  /** Another extension is already connected. */
  secondConnection: 4001,
  /** The extension's version differs from the server's. */
  versionMismatch: 4002,
} as const;

/** The error codes of the extension's error responses that the server tells apart. */
export const ErrorCode = {
  /** The tree's revision is not the plan's: nothing changed. */
  revisionMismatch: "revision-mismatch",
} as const;

export const BridgeRequest = z.strictObject({ id: z.int(), method: z.string(), params: z.unknown().optional() });
export type BridgeRequest = z.infer<typeof BridgeRequest>;

/** Why a request failed, in a response's `error`. */
export const ResponseError = z.strictObject({ code: z.string(), message: z.string() });
export type ResponseError = z.infer<typeof ResponseError>;

export const BridgeResponse = z.union([
  z.strictObject({ id: z.int(), result: z.unknown() }),
  z.strictObject({ id: z.int(), error: ResponseError }),
]);
export type BridgeResponse = z.infer<typeof BridgeResponse>;

export const BridgeNotification = z.strictObject({ method: z.string(), params: z.unknown().optional() });
export type BridgeNotification = z.infer<typeof BridgeNotification>;

/** Any one message on the bridge. */
export const BridgeMessage = z.union([BridgeRequest, BridgeResponse, BridgeNotification]);
export type BridgeMessage = z.infer<typeof BridgeMessage>;

/** `hello`'s params and its result: each side's version. */
export const HelloParams = z.strictObject({ version: z.string() });
export type HelloParams = z.infer<typeof HelloParams>;
export const HelloResult = HelloParams;
export type HelloResult = HelloParams;

/** `getTree`'s result: Chrome's whole tree, below the root. */
export const GetTreeResult = z.strictObject({ tree: z.array(ChromeNode) });
export type GetTreeResult = z.infer<typeof GetTreeResult>;

/** `applyOperations`'s params: the operations of a plan the server has validated, and the revision it was checked at. */
export const ApplyOperationsParams = z.strictObject({ revision: z.string(), operations: z.array(Operation) });
export type ApplyOperationsParams = z.infer<typeof ApplyOperationsParams>;

/** `applyOperations`'s result: `apply_plan`'s, without the backup's ID. */
export const ApplyOperationsResult = z.strictObject({
  applied: z.int().describe("How many operations ran, from the first"),
  created: z.record(z.string(), z.string()).describe("Key → the ID Chrome gave the node"),
  revision: z.string().describe("Of the tree afterwards"),
  failed: z.strictObject({ operation: z.int(), message: z.string() }).optional(),
});
export type ApplyOperationsResult = z.infer<typeof ApplyOperationsResult>;
