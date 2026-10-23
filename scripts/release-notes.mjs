// Prints a release's notes: the section of CHANGELOG.md under its version heading. Fails when the changelog has no
// entries for that version, so a release never goes out without notes.
//
//     node scripts/release-notes.mjs <version>

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** The lines under "## [<version>]" up to the next release heading, trimmed; undefined when there are none. */
export function releaseNotes(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start === -1) return undefined;
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## ["));
  const notes = lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
  return notes === "" ? undefined : notes;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [version] = process.argv.slice(2);
  if (!version) {
    console.error("Usage: node scripts/release-notes.mjs <version>");
    process.exit(2);
  }
  const notes = releaseNotes(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"), version);
  if (notes === undefined) {
    console.error(`CHANGELOG.md has no entries under a "## [${version}]" heading.`);
    process.exit(1);
  }
  console.log(notes);
}
