// The extension's end of the bridge, from docs/spec.md#bridge: it connects to the MCP server on 127.0.0.1, says
// `hello`, keeps its service worker running with a `keepalive` while connected, and answers the server's requests.

import { BRIDGE_PORT, BridgeMessage, CloseCode } from "@bookmark-organizer/shared";

/** How often the extension sends a `keepalive` while connected, which keeps its service worker running. */
const KEEPALIVE_INTERVAL_MS = 20_000;

/** Answers one request's params with its result, or throws to answer with an error. */
export type Handler = (params: unknown) => Promise<unknown>;

let socket: WebSocket | undefined;
let nextId = 1;
let connectingSince = 0;

/** Connects to the MCP server unless already connected or connecting. Does nothing when no server listens. */
export function connect(handlers: Record<string, Handler>): void {
  // A socket still connecting since the last alarm, 30 seconds ago, is stuck: give up on it and try again.
  if (socket?.readyState === WebSocket.CONNECTING && Date.now() - connectingSince > 30_000) socket.close();
  if (socket !== undefined && socket.readyState !== WebSocket.CLOSING && socket.readyState !== WebSocket.CLOSED) return;
  connectingSince = Date.now();
  const ws = new WebSocket(`ws://127.0.0.1:${String(BRIDGE_PORT)}`);
  socket = ws;
  const helloId = nextId++;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  function send(message: BridgeMessage): void {
    ws.send(JSON.stringify(message));
  }

  ws.addEventListener("open", () => {
    send({ id: helloId, method: "hello", params: { version: chrome.runtime.getManifest().version } });
  });

  ws.addEventListener("message", (event: MessageEvent<string>) => {
    let message: BridgeMessage;
    try {
      message = BridgeMessage.parse(JSON.parse(event.data));
    } catch {
      return;
    }
    if ("result" in message && message.id === helloId) {
      console.info("Bookmark Organizer: connected to the MCP server");
      keepalive = setInterval(() => {
        send({ method: "keepalive" });
      }, KEEPALIVE_INTERVAL_MS);
    } else if ("method" in message && "id" in message) {
      const { id, method, params } = message;
      const handler = Object.hasOwn(handlers, method) ? handlers[method] : undefined;
      if (handler === undefined) {
        send({ id, error: { code: "unknown-method", message: `Unknown method: ${method}` } });
        return;
      }
      handler(params).then(
        (result: unknown) => {
          send({ id, result });
        },
        (error: unknown) => {
          send({
            id,
            error: { code: "chrome-error", message: error instanceof Error ? error.message : String(error) },
          });
        },
      );
    }
  });

  ws.addEventListener("close", ({ code }) => {
    clearInterval(keepalive);
    if (socket === ws) socket = undefined;
    if (code === CloseCode.versionMismatch) {
      console.warn("Bookmark Organizer: the MCP server's version differs from this extension's; update one of them");
    } else if (code === CloseCode.secondConnection) {
      console.info("Bookmark Organizer: another Chrome profile is connected to the MCP server");
    }
  });
}
