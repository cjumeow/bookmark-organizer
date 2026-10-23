// A feat or fix pull request adds an entry under "## [Unreleased]" in CHANGELOG.md. Fails when none of the lines the
// pull request adds to CHANGELOG.md sits in that section.
//
//     node scripts/check-changelog-entry.mjs <base-sha> <head-sha>

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const UNRELEASED_HEADING = "## [Unreleased]";

/** Line numbers, in the new file, of the non-blank lines a unified diff adds. */
export function findAddedLineNumbers(unifiedDiff) {
  const addedLineNumbers = [];
  let newLineNumber = 0;
  for (const line of unifiedDiff.split("\n")) {
    const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunkHeader) {
      newLineNumber = Number(hunkHeader[1]);
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      if (line.slice(1).trim() !== "") addedLineNumbers.push(newLineNumber);
      newLineNumber += 1;
    } else if (line.startsWith(" ")) {
      newLineNumber += 1;
    }
  }
  return addedLineNumbers;
}

/** Whether any added line falls between the Unreleased heading and the next release heading. */
export function checkHasUnreleasedEntry(changelog, unifiedDiff) {
  const lines = changelog.split("\n");
  const headingIndex = lines.indexOf(UNRELEASED_HEADING);
  if (headingIndex === -1) return false;
  const nextHeadingIndex = lines.findIndex((line, index) => index > headingIndex && line.startsWith("## ["));
  const startLineNumber = headingIndex + 1;
  const endLineNumber = nextHeadingIndex === -1 ? Infinity : nextHeadingIndex + 1;
  return findAddedLineNumbers(unifiedDiff).some(
    (lineNumber) => lineNumber > startLineNumber && lineNumber < endLineNumber,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [baseSha, headSha] = process.argv.slice(2);
  if (!baseSha || !headSha) {
    console.error("Usage: node scripts/check-changelog-entry.mjs <base-sha> <head-sha>");
    process.exit(2);
  }
  const changelog = execFileSync("git", ["show", `${headSha}:CHANGELOG.md`], { encoding: "utf8" });
  const unifiedDiff = execFileSync("git", ["diff", "--unified=0", `${baseSha}...${headSha}`, "--", "CHANGELOG.md"], {
    encoding: "utf8",
  });
  if (!checkHasUnreleasedEntry(changelog, unifiedDiff)) {
    console.error(`A feat or fix adds an entry under ${UNRELEASED_HEADING} in CHANGELOG.md.`);
    process.exit(1);
  }
  console.log(`CHANGELOG.md has a new entry under ${UNRELEASED_HEADING}.`);
}
