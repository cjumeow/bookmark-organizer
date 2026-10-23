import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createBackupStore } from "./backups.js";
import { createBridge } from "./bridge.js";
import { createServer, version } from "./server.js";

const bridge = createBridge({ version });
const server = createServer(bridge, createBackupStore());
// When the agent disconnects, free the bridge's port now rather than after 10 idle minutes, so another session can
// use it, and let the process exit.
server.server.onclose = () => {
  void bridge.close();
};
// The stdio transport does not notice its input ending, which is how a client that exits disconnects.
process.stdin.once("end", () => {
  void server.close();
});

// stdout carries the MCP messages, so anything for people goes to stderr.
await server.connect(new StdioServerTransport());
console.error("bookmark-organizer MCP server is running on stdio");
