import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server.js";

// stdout carries the MCP messages, so anything for people goes to stderr.
const server = createServer();
await server.connect(new StdioServerTransport());
console.error("bookmark-organizer MCP server is running on stdio");
