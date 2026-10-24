// The repository has one version, written in six files, and the Claude Code plugin pins its MCP server to it. Fails
// when they disagree, naming each place and its version.
//
//     npm run check:versions

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const VERSIONED_FILE_PATHS = [
  "package.json",
  "extension/package.json",
  "extension/manifest.json",
  "mcp-server/package.json",
  "shared/package.json",
  ".claude-plugin/plugin.json",
];

// The plugin starts the server with `npx -y bookmark-organizer-mcp@<version>`, which must be the plugin's own version.
const PLUGIN_SERVER_PIN = ".claude-plugin/plugin.json (mcpServers)";

/** Returns one problem line per file whose version differs from the root package.json's, or none. */
export function findVersionMismatches(versionByFilePath) {
  const [rootFilePath, rootVersion] = Object.entries(versionByFilePath)[0];
  return Object.entries(versionByFilePath)
    .filter(([, version]) => version !== rootVersion)
    .map(([filePath, version]) => `${filePath} has version ${version}, but ${rootFilePath} has ${rootVersion}`);
}

/** The version in the plugin's `bookmark-organizer-mcp@<version>` server argument, or undefined when it has none. */
export function pinnedServerVersion(pluginManifest) {
  const args = pluginManifest.mcpServers?.["bookmark-organizer"]?.args ?? [];
  for (const arg of args) {
    const match = /^bookmark-organizer-mcp@(.+)$/.exec(arg);
    if (match) return match[1];
  }
  return undefined;
}

function readVersionByFilePath(repositoryDirUrl) {
  const read = (filePath) => JSON.parse(readFileSync(new URL(filePath, repositoryDirUrl), "utf8"));
  return {
    ...Object.fromEntries(VERSIONED_FILE_PATHS.map((filePath) => [filePath, read(filePath).version])),
    [PLUGIN_SERVER_PIN]: pinnedServerVersion(read(".claude-plugin/plugin.json")),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mismatches = findVersionMismatches(readVersionByFilePath(new URL("../", import.meta.url)));
  if (mismatches.length > 0) {
    console.error(mismatches.join("\n"));
    console.error("Set the same version in all of: " + [...VERSIONED_FILE_PATHS, PLUGIN_SERVER_PIN].join(", "));
    process.exit(1);
  }
  console.log("All versions match.");
}
