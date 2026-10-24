// A Claude Code PostToolUse hook (.claude/settings.json): after an agent writes or edits a file, formats that file with
// Prettier, with the project's settings and .prettierignore, so a change never fails `npm run format:check` on format.
// Claude Code passes the tool call as JSON on stdin. The hook never fails the edit: anything it cannot format is left.
//
//     node scripts/format-edited-file.mjs < hook-input.json

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as prettier from "prettier";

/** The path the Write or Edit tool call wrote, or undefined when it names none. */
export function editedFilePath(hookInput) {
  return hookInput.tool_response?.filePath ?? hookInput.tool_input?.file_path;
}

/** Formats one file in place: "formatted", "unchanged", "ignored" (Prettier skips it) or "outside" the project. */
export async function formatEditedFile(filePath, projectDir) {
  const file = resolve(projectDir, filePath);
  const fromProject = relative(projectDir, file);
  if (fromProject.startsWith("..") || isAbsolute(fromProject)) return "outside";

  const { ignored, inferredParser } = await prettier.getFileInfo(file, {
    ignorePath: [join(projectDir, ".gitignore"), join(projectDir, ".prettierignore")],
    resolveConfig: true,
  });
  if (ignored || inferredParser === null) return "ignored";

  const source = await readFile(file, "utf8");
  const options = (await prettier.resolveConfig(file)) ?? {};
  const formatted = await prettier.format(source, { ...options, filepath: file });
  if (formatted === source) return "unchanged";
  await writeFile(file, formatted);
  return "formatted";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const filePath = editedFilePath(JSON.parse(input));
    const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
    if (filePath !== undefined) await formatEditedFile(filePath, projectDir);
  } catch (error) {
    // A file Prettier cannot parse (for example, half written) is left as it is; format:check still catches it.
    console.error(`format-edited-file: ${String(error)}`);
  }
}
