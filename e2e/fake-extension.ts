// A Node WebSocket that plays the extension on the bridge, for the end-to-end tests that need it to misbehave or to
// look at the server's side while it answers: another version, a disconnect, a request it answers by hand.

import { readFileSync } from "node:fs";

import { BRIDGE_PORT, BridgeRequest, EXTENSION_ID } from "@bookmark-organizer/shared";
import WebSocket from "ws";

/** The version the built server has, which a fake extension says to be let in. */
export const { version } = JSON.parse(readFileSync(new URL("../mcp-server/package.json", import.meta.url), "utf8")) as {
  version: string;
};

/**
 * Connects as the extension does, retrying until the server's listener is up, and says `hello` with `extensionVersion`.
 * Resolves to the socket once the hello is sent.
 */
export async function connectAsExtension(extensionVersion: string): Promise<WebSocket> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const socket = new WebSocket(`ws://127.0.0.1:${String(BRIDGE_PORT)}`, {
      origin: `chrome-extension://${EXTENSION_ID}`,
    });
    const opened = await new Promise<boolean>((resolve) => {
      socket.once("open", () => {
        resolve(true);
      });
      socket.once("error", () => {
        resolve(false);
      });
    });
    if (opened) {
      socket.send(JSON.stringify({ id: 1, method: "hello", params: { version: extensionVersion } }));
      return socket;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The server's bridge never listened");
}

/** An error a handler throws to answer with its own code, as the extension's `RequestError` does. */
export class FakeRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Answers the server's requests with `handlers`, by method: with what a handler returns, or with an error when it
 * throws. A request no handler is given for is not answered.
 */
export function answerRequests(socket: WebSocket, handlers: Record<string, (params: unknown) => unknown>): void {
  socket.on("message", (data: Buffer) => {
    const request = BridgeRequest.safeParse(JSON.parse(data.toString()));
    if (!request.success) return;
    const { id, method, params } = request.data;
    const handler = handlers[method];
    if (handler === undefined) return;
    Promise.resolve()
      .then(() => handler(params))
      .then(
        (result: unknown) => {
          socket.send(JSON.stringify({ id, result }));
        },
        (error: unknown) => {
          const code = error instanceof FakeRequestError ? error.code : "chrome-error";
          socket.send(JSON.stringify({ id, error: { code, message: String(error) } }));
        },
      );
  });
}
