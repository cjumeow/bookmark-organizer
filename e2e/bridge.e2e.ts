import { createServer } from "node:http";

import { expect, test } from "./fixtures.js";

test("a web page on http://localhost cannot connect to the bridge", async ({ context, mcp }) => {
  // Opens the listener; the extension may connect meanwhile, which does not matter here. The call ends with the test.
  mcp.call("get_tree").catch(() => undefined);

  const site = createServer((_, response) => response.end("<!doctype html><title>Example</title>"));
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const { port } = site.address() as { port: number };
  try {
    const page = await context.newPage();
    await page.goto(`http://localhost:${String(port)}/`);
    const handshakeErrors: string[] = [];
    page.on("websocket", (socket) => {
      socket.on("socketerror", (error) => handshakeErrors.push(error));
    });
    // Retry until the listener is up, as a page would.
    const outcome = await page.evaluate(async () => {
      for (let attempt = 0; attempt < 20; attempt++) {
        const result = await new Promise<string>((resolve) => {
          const socket = new WebSocket("ws://127.0.0.1:47615");
          socket.onopen = () => {
            resolve("open");
          };
          socket.onclose = (event) => {
            resolve(`closed ${String(event.code)}`);
          };
        });
        if (result === "open") return result;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return "never connected";
    });
    console.log(`page's WebSocket: ${outcome}; handshake errors seen by Chromium:\n${handshakeErrors.join("\n")}`);

    expect(outcome).toBe("never connected");
    expect(handshakeErrors).toContainEqual(expect.stringContaining("403"));
  } finally {
    // The page keeps its connection to the site open, which close() would wait for.
    site.closeAllConnections();
    await new Promise((resolve) => site.close(resolve));
  }
});
