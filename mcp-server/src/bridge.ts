// The MCP server's end of the bridge, from docs/spec.md#bridge: a WebSocket on 127.0.0.1 that the extension connects
// to. The listener opens on the first request, so a server no tool needs never holds the port.

import { createServer, type Server } from "node:http";

import { BridgeMessage, BRIDGE_PORT, CloseCode, EXTENSION_ID, HelloParams } from "@bookmark-organizer/shared";
import { type WebSocket, WebSocketServer } from "ws";

import { isUpgradeAllowed } from "./upgrade.js";

export interface BridgeOptions {
  /** The server's version, which the extension's must equal. */
  version: string;
  port?: number;
  /** The `Origin` the extension connects with. */
  origin?: string;
  /** How long a request waits for the extension to connect. */
  connectTimeoutMs?: number;
  /** How long a request waits for the extension's answer. */
  requestTimeoutMs?: number;
  /** How long after the last request the bridge closes the connection and the listener, freeing the port. */
  idleTimeoutMs?: number;
}

export interface Bridge {
  /** Sends a request to the extension and resolves to its result. Rejects with a `BridgeError`. */
  request(method: string, params?: unknown): Promise<unknown>;
  /** Closes the connection and the listener. */
  close(): Promise<void>;
}

/** Why a request failed. `code` is one of the bridge's own below, or the code of the extension's error response. */
export class BridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
  }
}

interface Waiter<T> {
  resolve(value: T): void;
  reject(error: Error): void;
}

/** A promise that rejects with `onTimeout()` after `ms`, and the callbacks that settle it first. */
function withTimeout<T>(ms: number, onTimeout: () => Error): { promise: Promise<T>; waiter: Waiter<T> } {
  let waiter!: Waiter<T>;
  const promise = new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(onTimeout());
    }, ms);
    // A request waiting does not keep the server running once its transport has closed.
    timer.unref();
    waiter = {
      resolve(value) {
        clearTimeout(timer);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      },
    };
  });
  return { promise, waiter };
}

export function createBridge({
  version,
  port = BRIDGE_PORT,
  origin = `chrome-extension://${EXTENSION_ID}`,
  connectTimeoutMs = 40_000,
  requestTimeoutMs = 60_000,
  idleTimeoutMs = 10 * 60_000,
}: BridgeOptions): Bridge {
  const allowed = { origin, host: `127.0.0.1:${String(port)}` };
  const wss = new WebSocketServer({ noServer: true });
  let server: Server | undefined;
  let listening: Promise<void> | undefined;
  /** The one connection the bridge keeps, from when it is accepted. */
  let connection: WebSocket | undefined;
  /** The same connection once its `hello` succeeded. */
  let extension: WebSocket | undefined;
  /** Requests waiting for the extension to connect. */
  const waiting = new Set<Waiter<WebSocket>>();
  /** Requests sent and waiting for their answer, by `id`. */
  const pending = new Map<number, Waiter<unknown>>();
  let nextId = 1;
  let idleTimer: NodeJS.Timeout | undefined;

  function accept(ws: WebSocket): void {
    if (connection !== undefined) {
      ws.close(CloseCode.secondConnection, "Another extension is connected");
      return;
    }
    connection = ws;
    ws.on("close", () => {
      if (connection !== ws) return;
      connection = extension = undefined;
      const error = new BridgeError("disconnected", "The extension disconnected before it answered.");
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    });
    ws.on("message", (data: Buffer) => {
      receive(ws, data);
    });
  }

  /** Parses a message, or returns undefined for one that is not JSON or not a bridge message. */
  function parse(data: Buffer): BridgeMessage | undefined {
    try {
      return BridgeMessage.parse(JSON.parse(data.toString()));
    } catch {
      return undefined;
    }
  }

  function receive(ws: WebSocket, data: Buffer): void {
    const message = parse(data);
    if (message === undefined) return;
    if ("method" in message && "id" in message && message.method === "hello") {
      const hello = HelloParams.safeParse(message.params);
      if (!hello.success) return;
      if (hello.data.version !== version) {
        ws.close(CloseCode.versionMismatch, "Version mismatch");
        const error = new BridgeError(
          "version-mismatch",
          `Update the extension (version ${hello.data.version}) to match the server (version ${version}).`,
        );
        for (const waiter of waiting) waiter.reject(error);
        waiting.clear();
        return;
      }
      ws.send(JSON.stringify({ id: message.id, result: { version } }));
      extension = ws;
      for (const waiter of waiting) waiter.resolve(ws);
      waiting.clear();
    } else if ("id" in message && !("method" in message)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if ("error" in message) request?.reject(new BridgeError(message.error.code, message.error.message));
      else request?.resolve(message.result);
    }
  }

  function listen(): Promise<void> {
    const http = createServer();
    http.on("upgrade", (request, socket, head) => {
      if (!isUpgradeAllowed(request.headers, allowed)) {
        socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
        return;
      }
      wss.handleUpgrade(request, socket, head, accept);
    });
    return new Promise((resolve, reject) => {
      http.once("error", (error: NodeJS.ErrnoException) => {
        reject(
          error.code === "EADDRINUSE"
            ? new BridgeError("port-taken", "Another session is using the bridge; finish there or close it.")
            : error,
        );
      });
      http.listen(port, "127.0.0.1", () => {
        server = http;
        resolve();
      });
    });
  }

  async function connected(): Promise<WebSocket> {
    listening ??= listen().catch((error: unknown) => {
      listening = undefined;
      throw error;
    });
    const opening = listening;
    await opening;
    if (listening !== opening) throw new BridgeError("closed", "The bridge closed.");
    if (extension !== undefined) return extension;
    const { promise, waiter } = withTimeout<WebSocket>(connectTimeoutMs, () => {
      waiting.delete(waiter);
      return new BridgeError(
        "chrome-not-reachable",
        "Chrome is not reachable: open Chrome with the Bookmark Organizer extension turned on.",
      );
    });
    waiting.add(waiter);
    return promise;
  }

  async function send(method: string, params: unknown): Promise<unknown> {
    const socket = await connected();
    const id = nextId++;
    const { promise, waiter } = withTimeout<unknown>(requestTimeoutMs, () => {
      pending.delete(id);
      return new BridgeError("no-answer", "The extension did not answer.");
    });
    if (socket.readyState !== socket.OPEN) {
      throw new BridgeError("disconnected", "The extension disconnected before it answered.");
    }
    pending.set(id, waiter);
    socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  /** Closes the bridge `idleTimeoutMs` from now, unless a request comes first or is still waiting then. */
  function closeWhenIdle(): void {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (waiting.size > 0 || pending.size > 0) closeWhenIdle();
      else void close();
    }, idleTimeoutMs);
    // A timer alone does not keep the server running.
    idleTimer.unref();
  }

  async function close(): Promise<void> {
    clearTimeout(idleTimer);
    // A listener still opening is closed once it is open, not left holding the port.
    const opening = listening;
    listening = undefined;
    await opening?.catch(() => undefined);
    const http = server;
    server = undefined;
    if (http === undefined) return;
    const error = new BridgeError("closed", "The bridge closed.");
    for (const waiter of waiting) waiter.reject(error);
    waiting.clear();
    for (const client of wss.clients) client.close(1001, "The bridge is closing");
    await new Promise((resolve) => http.close(resolve));
  }

  return {
    async request(method, params) {
      closeWhenIdle();
      try {
        return await send(method, params);
      } finally {
        closeWhenIdle();
      }
    },
    close,
  };
}
