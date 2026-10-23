import { createServer } from "node:net";

import { afterEach, describe, expect, test } from "vitest";
import { WebSocket } from "ws";

import { type Bridge, createBridge } from "./bridge.js";

const VERSION = "1.2.3";
const ORIGIN = "chrome-extension://ancijliidboahicggjggbhlflehlnbjg";

/** A port nothing listens on right now, so tests never meet a real bridge on 47615. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise((resolve) => server.close(resolve));
  return port;
}

type Answer = (method: string, params: unknown, id: number) => unknown;

/**
 * A WebSocket client playing the extension: connects as soon as the bridge listens, sends `hello`, and answers each
 * request with `answer`'s return value as the response (a `{ result }` or an `{ error }`), or not at all for undefined.
 */
class FakeExtension {
  readonly socket: WebSocket;
  readonly closed: Promise<{ code: number }>;
  readonly hello: Promise<unknown>;

  private constructor(socket: WebSocket, answer: Answer, version: string) {
    this.socket = socket;
    this.closed = new Promise((resolve) =>
      socket.once("close", (code) => {
        resolve({ code });
      }),
    );
    this.hello = new Promise((resolve) => {
      socket.on("message", (data: Buffer) => {
        const message = JSON.parse(data.toString()) as { id: number; method?: string; params?: unknown };
        if (message.id === 0) {
          resolve(message);
        } else if (message.method !== undefined) {
          const response = answer(message.method, message.params, message.id);
          if (response !== undefined) socket.send(JSON.stringify({ id: message.id, ...response }));
        }
      });
    });
    socket.send(JSON.stringify({ id: 0, method: "hello", params: { version } }));
  }

  static async connect(
    port: number,
    {
      answer = () => undefined,
      version = VERSION,
      origin = ORIGIN,
    }: { answer?: Answer; version?: string; origin?: string } = {},
  ): Promise<FakeExtension> {
    for (;;) {
      const socket = new WebSocket(`ws://127.0.0.1:${String(port)}`, { origin });
      const opened = await new Promise<boolean>((resolve) => {
        socket.once("open", () => {
          resolve(true);
        });
        socket.once("error", () => {
          resolve(false);
        });
      });
      if (opened) return new FakeExtension(socket, answer, version);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

/** The HTTP status the bridge answers an upgrade with, once it listens: 101 when it accepts the connection. */
async function upgradeStatus(port: number, headers: { origin?: string; host?: string }): Promise<number> {
  for (;;) {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}`, { headers });
    const status = await new Promise<number | undefined>((resolve) => {
      socket.once("open", () => {
        resolve(101);
      });
      socket.once("unexpected-response", (_, response) => {
        resolve(response.statusCode);
      });
      socket.once("error", () => {
        resolve(undefined);
      });
    });
    socket.terminate();
    if (status !== undefined) return status;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Whether a new listener can open on the port, which it cannot while the bridge holds it. */
async function portIsFree(port: number): Promise<boolean> {
  const server = createServer();
  const free = await new Promise<boolean>((resolve) => {
    server.once("error", () => {
      resolve(false);
    });
    server.listen(port, "127.0.0.1", () => {
      resolve(true);
    });
  });
  if (free) await new Promise((resolve) => server.close(resolve));
  return free;
}

let bridge: Bridge | undefined;
afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
});

describe("bridge.request", () => {
  test("resolves to the result the extension answers", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN });

    const result = bridge.request("getTree");
    await FakeExtension.connect(port, { answer: () => ({ result: { tree: [] } }) });

    await expect(result).resolves.toEqual({ tree: [] });
  });

  test("refuses an upgrade from another Origin with 403", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN });

    bridge.request("getTree").catch(() => undefined);

    expect(await upgradeStatus(port, { origin: "http://localhost:3000" })).toBe(403);
  });

  test("closes a second connection with 4001 and keeps the first", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN });
    const first = bridge.request("getTree");
    await FakeExtension.connect(port, { answer: () => ({ result: "first" }) });
    await first;

    const second = await FakeExtension.connect(port, { answer: () => ({ result: "second" }) });

    expect(await second.closed).toEqual({ code: 4001 });
    await expect(bridge.request("getTree")).resolves.toBe("first");
  });

  test("closes an extension of another version with 4002, and the request reports the mismatch", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN });

    const failure = bridge.request("getTree").catch((error: unknown) => error);
    const extension = await FakeExtension.connect(port, { version: "1.0.0" });

    expect(await extension.closed).toEqual({ code: 4002 });
    expect(await failure).toMatchObject({
      code: "version-mismatch",
      message: "Update the extension (version 1.0.0) to match the server (version 1.2.3).",
    });
  });

  test("rejects with the error the extension answers", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN });

    const failure = bridge.request("applyOperations").catch((error: unknown) => error);
    await FakeExtension.connect(port, {
      answer: () => ({ error: { code: "revision-mismatch", message: "The bookmarks changed." } }),
    });

    expect(await failure).toMatchObject({ code: "revision-mismatch", message: "The bookmarks changed." });
  });

  test("matches each response to its request by id", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN });
    const idOf = new Map<string, number>();

    const first = bridge.request("first");
    const second = bridge.request("second");
    const extension = await FakeExtension.connect(port, {
      answer: (method, _params, id) => {
        idOf.set(method, id);
        return undefined;
      },
    });
    await expect.poll(() => idOf.size).toBe(2);
    // Newest first, so answering in the order the requests were sent would give each the other's result.
    for (const [method, id] of [...idOf].sort(([, a], [, b]) => b - a)) {
      extension.socket.send(JSON.stringify({ id, result: `answer to ${method}` }));
    }

    expect(await Promise.all([first, second])).toEqual(["answer to first", "answer to second"]);
  });

  test("rejects when no extension connects in time", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN, connectTimeoutMs: 50 });

    await expect(bridge.request("getTree")).rejects.toMatchObject({
      code: "chrome-not-reachable",
      message: "Chrome is not reachable: open Chrome with the Bookmark Organizer extension turned on.",
    });
  });

  test("rejects when the extension does not answer in time", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN, requestTimeoutMs: 50 });

    const failure = bridge.request("getTree").catch((error: unknown) => error);
    await FakeExtension.connect(port, { answer: () => undefined });

    expect(await failure).toMatchObject({
      code: "no-answer",
      message: "The extension did not answer.",
    });
  });

  test("rejects when the connection closes before the answer", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN });

    const failure = bridge.request("getTree").catch((error: unknown) => error);
    const extension = await FakeExtension.connect(port, {
      answer: () => {
        extension.socket.close();
        return undefined;
      },
    });

    expect(await failure).toMatchObject({
      code: "disconnected",
      message: "The extension disconnected before it answered.",
    });
  });

  test("rejects when another process holds the port", async () => {
    const port = await freePort();
    const other = createServer();
    await new Promise<void>((resolve) => other.listen(port, "127.0.0.1", resolve));
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN });

    try {
      await expect(bridge.request("getTree")).rejects.toMatchObject({
        code: "port-taken",
        message: "Another session is using the bridge; finish there or close it.",
      });
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });

  test("closes the connection and frees the port after a while without requests", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN, idleTimeoutMs: 100 });
    const result = bridge.request("getTree");
    const extension = await FakeExtension.connect(port, { answer: () => ({ result: "tree" }) });
    await result;
    expect(await portIsFree(port)).toBe(false);

    expect(await extension.closed).toEqual({ code: 1001 });
    expect(await portIsFree(port)).toBe(true);
  });

  test("ignores a message it cannot read and keeps answering", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN });
    const first = bridge.request("getTree");
    const extension = await FakeExtension.connect(port, { answer: () => ({ result: "tree" }) });
    await first;

    extension.socket.send("not JSON");
    extension.socket.send(JSON.stringify({ unexpected: true }));

    await expect(bridge.request("getTree")).resolves.toBe("tree");
  });

  test("rejects a request still waiting for the extension when the bridge closes", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN });

    const failure = bridge.request("getTree").catch((error: unknown) => error);
    await expect.poll(() => portIsFree(port)).toBe(false);
    await bridge.close();

    expect(await failure).toMatchObject({ code: "closed", message: "The bridge closed." });
  });

  test("frees the port when closed while the listener is still opening", async () => {
    const port = await freePort();
    bridge = createBridge({ version: VERSION, port, origin: ORIGIN });

    const failure = bridge.request("getTree").catch((error: unknown) => error);
    await bridge.close();

    expect(await failure).toMatchObject({ code: "closed" });
    expect(await portIsFree(port)).toBe(true);
  });
});
