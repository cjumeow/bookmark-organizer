import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { editedFilePath, formatEditedFile } from "./format-edited-file.mjs";

describe("editedFilePath", () => {
  it("reads the path a Write or Edit tool call wrote", () => {
    expect(editedFilePath({ tool_name: "Edit", tool_input: { file_path: "/repo/a.ts" } })).toBe("/repo/a.ts");
  });

  it("prefers the path in the tool's response", () => {
    const input = { tool_input: { file_path: "a.ts" }, tool_response: { filePath: "/repo/a.ts" } };
    expect(editedFilePath(input)).toBe("/repo/a.ts");
  });

  it("finds nothing in a tool call without a path", () => {
    expect(editedFilePath({ tool_name: "Edit", tool_input: {} })).toBeUndefined();
  });
});

describe("formatEditedFile", () => {
  function project(files) {
    const dir = mkdtempSync(join(tmpdir(), "format-hook-"));
    for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
    return dir;
  }

  it("formats a file Prettier handles, with the project's settings", async () => {
    const dir = project({ ".prettierrc.json": '{ "printWidth": 120 }', "a.ts": "const  x = {a:1}\n" });
    expect(await formatEditedFile(join(dir, "a.ts"), dir)).toBe("formatted");
    expect(readFileSync(join(dir, "a.ts"), "utf8")).toBe("const x = { a: 1 };\n");
  });

  it("leaves a file the project's .prettierignore names", async () => {
    const dir = project({ ".prettierignore": "*.md\n", "notes.md": "#  Title\n" });
    expect(await formatEditedFile(join(dir, "notes.md"), dir)).toBe("ignored");
    expect(readFileSync(join(dir, "notes.md"), "utf8")).toBe("#  Title\n");
  });

  it("leaves a file Prettier has no parser for", async () => {
    const dir = project({ "script.sh": "echo  hi\n" });
    expect(await formatEditedFile(join(dir, "script.sh"), dir)).toBe("ignored");
  });

  it("leaves a file outside the project", async () => {
    const outside = project({ "b.ts": "const  y = 1\n" });
    const dir = project({});
    expect(await formatEditedFile(join(outside, "b.ts"), dir)).toBe("outside");
    expect(readFileSync(join(outside, "b.ts"), "utf8")).toBe("const  y = 1\n");
  });

  it("reports a file that is already formatted", async () => {
    const dir = project({ "a.ts": "const x = 1;\n" });
    expect(await formatEditedFile(join(dir, "a.ts"), dir)).toBe("unchanged");
  });
});
