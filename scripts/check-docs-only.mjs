// Prints "true" when a pull request changes only documentation, so check-code can skip the checks that never read it,
// and "false" otherwise. Documentation is Markdown outside skills/, where the organizer skill is part of the product.
//
//     node scripts/check-docs-only.mjs <base-sha> <head-sha>

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Whether every changed path is documentation. An empty change is not, so nothing is skipped by accident. */
export function isDocsOnly(paths) {
  return paths.length > 0 && paths.every((path) => path.endsWith(".md") && !path.startsWith("skills/"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [baseSha, headSha] = process.argv.slice(2);
  if (!baseSha || !headSha) {
    console.error("Usage: node scripts/check-docs-only.mjs <base-sha> <head-sha>");
    process.exit(2);
  }
  // --no-renames lists both sides of a rename, so moving code into a .md path still counts as a code change.
  const paths = execFileSync("git", ["diff", "--name-only", "--no-renames", `${baseSha}...${headSha}`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  console.log(String(isDocsOnly(paths)));
}
