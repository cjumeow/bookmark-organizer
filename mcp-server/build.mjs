// Bundles the server into dist/index.js with esbuild, so it can import @bookmark-organizer/shared, which is TypeScript
// source with no build of its own.
//
//     npm run build -w mcp-server
//
// A package in `dependencies` stays outside the bundle and is loaded from node_modules when the server runs; everything
// else is bundled in, and so is this repository's own code (@bookmark-organizer/*) wherever it is listed.

import { readFileSync, rmSync } from "node:fs";

import { build } from "esbuild";

const { dependencies = {} } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

rmSync(new URL("dist", import.meta.url), { recursive: true, force: true });
await build({
  absWorkingDir: import.meta.dirname,
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  external: Object.keys(dependencies).filter((name) => !name.startsWith("@bookmark-organizer/")),
});
