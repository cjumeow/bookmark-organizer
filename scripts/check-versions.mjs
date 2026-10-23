// The repository has one version, written in four files. Fails when they disagree, naming each file and its version.
//
//     npm run check:versions

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const VERSIONED_FILE_PATHS = [
  "package.json",
  "extension/package.json",
  "extension/manifest.json",
  "mcp-server/package.json",
];

/** Returns one problem line per file whose version differs from the root package.json's, or none. */
export function findVersionMismatches(versionByFilePath) {
  const [rootFilePath, rootVersion] = Object.entries(versionByFilePath)[0];
  return Object.entries(versionByFilePath)
    .filter(([, version]) => version !== rootVersion)
    .map(([filePath, version]) => `${filePath} has version ${version}, but ${rootFilePath} has ${rootVersion}`);
}

function readVersionByFilePath(repositoryDirUrl) {
  return Object.fromEntries(
    VERSIONED_FILE_PATHS.map((filePath) => {
      const { version } = JSON.parse(readFileSync(new URL(filePath, repositoryDirUrl), "utf8"));
      return [filePath, version];
    }),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mismatches = findVersionMismatches(readVersionByFilePath(new URL("../", import.meta.url)));
  if (mismatches.length > 0) {
    console.error(mismatches.join("\n"));
    console.error("Set the same version in all of: " + VERSIONED_FILE_PATHS.join(", "));
    process.exit(1);
  }
  console.log("All versions match.");
}
