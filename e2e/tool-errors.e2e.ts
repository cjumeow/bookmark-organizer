// What the built MCP server tells the agent when it cannot do its work, from docs/spec.md#errors, without Chrome: a
// Node WebSocket plays the extension where one is needed.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

import { BRIDGE_PORT, BridgeRequest, EXTENSION_ID } from "@bookmark-organizer/shared";
import WebSocket from "ws";

import { expect, test, textOf } from "./fixtures.js";

const { version } = JSON.parse(readFileSync(new URL("../mcp-server/package.json", import.meta.url), "utf8")) as {
  version: string;
};

/** Listens on the bridge's port, as another session's server would, or rejects when the port is taken. */
async function holdPort(): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(BRIDGE_PORT, "127.0.0.1", resolve);
  });
  return server;
}

/** Whether something accepts connections on the bridge's port. */
function isListening(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(BRIDGE_PORT, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}

/**
 * Connects as the extension does, retrying until the server's listener is up, and says `hello` with `extensionVersion`.
 * Resolves to the socket once the hello is sent.
 */
async function connectAsExtension(extensionVersion: string): Promise<WebSocket> {
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

test("the server sends its instructions and offers get_tree and check_plan as read-only tools", async ({ mcp }) => {
  const instructions = mcp.client.getInstructions();
  const { tools } = await mcp.client.listTools();
  console.log(`instructions: ${JSON.stringify(instructions)}\ntools/list: ${JSON.stringify(tools, null, 2)}`);

  expect(instructions).toBe(
    "Bookmark Organizer reads and changes the person's Chrome bookmarks. Decide names and folders by the " +
      "bookmark-organizer skill. Run check_plan and show the person its changes before apply_plan, and apply only " +
      "after they agree.",
  );
  expect(tools.map(({ name, annotations }) => ({ name, annotations }))).toEqual([
    { name: "get_tree", annotations: { readOnlyHint: true } },
    { name: "check_plan", annotations: { readOnlyHint: true } },
  ]);
});

test("get_tree says Chrome is not reachable when no extension connects within 40 seconds", async ({ mcp }) => {
  const started = Date.now();
  const result = await mcp.call("get_tree");
  const elapsed = Date.now() - started;

  expect(result.isError).toBe(true);
  expect(textOf(result)).toBe("Chrome is not reachable: open Chrome with the Bookmark Organizer extension turned on.");
  expect(elapsed).toBeGreaterThanOrEqual(40_000);
  expect(elapsed).toBeLessThan(45_000);
});

test("get_tree says another session is using the bridge when its port is taken", async ({ mcp }) => {
  const other = await holdPort();
  try {
    const result = await mcp.call("get_tree");

    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Another session is using the bridge; finish there or close it.");
  } finally {
    await new Promise((resolve) => other.close(resolve));
  }
});

test("get_tree says which side to update when the extension's version differs", async ({ mcp }) => {
  const call = mcp.call("get_tree");
  const socket = await connectAsExtension("0.0.0");
  const result = await call;
  socket.close();

  expect(result.isError).toBe(true);
  expect(textOf(result)).toBe(`Update the extension (version 0.0.0) to match the server (version ${version}).`);
});

test("check_plan says the extension disconnected when it closes before answering", async ({ mcp }) => {
  const call = mcp.call("check_plan", { revision: "0000000000000000", operations: [] });
  const socket = await connectAsExtension(version);
  socket.on("message", (data: Buffer) => {
    const message = BridgeRequest.safeParse(JSON.parse(data.toString()));
    if (message.success && message.data.method === "getTree") socket.close();
  });
  const result = await call;

  expect(result.isError).toBe(true);
  expect(textOf(result)).toBe("The extension disconnected before it answered.");
});

test("check_plan refuses an operation with a field the plan format does not have", async ({ mcp }) => {
  const result = await mcp.call("check_plan", {
    revision: "0000000000000000",
    operations: [{ op: "move", node: "10", parent: "2", idx: 0 }],
  });

  expect(result.isError).toBe(true);
  expect(textOf(result)).toContain("Input validation error: Invalid arguments for tool check_plan");
  expect(textOf(result)).toContain('"idx"');
});

test("the server frees the bridge's port and exits when the agent closes its input", async () => {
  // Spawned by hand rather than with the SDK's client, whose close() also sends SIGTERM and would hide a server that
  // stays up.
  const server = spawn(process.execPath, [fileURLToPath(new URL("../mcp-server/dist/index.js", import.meta.url))], {
    stdio: ["pipe", "ignore", "inherit"],
  });
  const exited = new Promise<number | null>((resolve) => server.once("exit", resolve));
  try {
    for (const message of [
      {
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "0.0.0" } },
      },
      { method: "notifications/initialized" },
      // Opens the bridge's listener, which waits for an extension that never comes.
      { id: 2, method: "tools/call", params: { name: "get_tree", arguments: {} } },
    ]) {
      server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
    }
    await expect.poll(isListening).toBe(true);

    server.stdin.end();
    const code = await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000, "still running"))]);

    expect(code).toBe(0);
    const free = await holdPort();
    await new Promise((resolve) => free.close(resolve));
  } finally {
    server.kill();
  }
});
