// What crosses the bridge between the MCP server and the extension, from the spec's "Bridge" section:
// docs/spec.md#bridge. Both ends parse what they receive with these schemas.

import { z } from "zod";

import { ChromeNode } from "./chrome-node.js";

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
