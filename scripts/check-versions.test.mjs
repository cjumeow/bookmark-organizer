import { describe, expect, it } from "vitest";

import { findVersionMismatches } from "./check-versions.mjs";

describe("findVersionMismatches", () => {
  it("finds nothing when every file has the root version", () => {
    expect(
      findVersionMismatches({
        "package.json": "1.2.0",
        "extension/manifest.json": "1.2.0",
        "mcp-server/package.json": "1.2.0",
      }),
    ).toEqual([]);
  });

  it("names each file that differs from the root package.json", () => {
    expect(
      findVersionMismatches({
        "package.json": "1.2.0",
        "extension/manifest.json": "1.1.0",
        "mcp-server/package.json": "1.2.0",
      }),
    ).toEqual(["extension/manifest.json has version 1.1.0, but package.json has 1.2.0"]);
  });

  it("reports a missing version instead of passing", () => {
    expect(findVersionMismatches({ "package.json": "1.2.0", "extension/manifest.json": undefined })).toEqual([
      "extension/manifest.json has version undefined, but package.json has 1.2.0",
    ]);
  });
});
