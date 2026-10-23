import { readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// package.json is the one place the version is written; dist/ and src/ both sit beside it.
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export function createServer(): McpServer {
  return new McpServer({ name: "bookmark-organizer", version: packageJson.version });
}
