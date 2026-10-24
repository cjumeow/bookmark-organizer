import { describe, expect, it } from "vitest";

import { releaseNotes } from "./release-notes.mjs";

const changelog = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "## [0.2.0] - 2026-11-01",
  "",
  "### Fixed",
  "",
  "- A fix.",
  "",
  "## [0.1.0] - 2026-10-24",
  "",
  "### Added",
  "",
  "- The first tools.",
  "",
].join("\n");

describe("releaseNotes", () => {
  it("returns the version's section without its heading", () => {
    expect(releaseNotes(changelog, "0.2.0")).toBe("### Fixed\n\n- A fix.");
  });

  it("reads the last section up to the end of the file", () => {
    expect(releaseNotes(changelog, "0.1.0")).toBe("### Added\n\n- The first tools.");
  });

  it("returns nothing for a version the changelog does not have", () => {
    expect(releaseNotes(changelog, "0.3.0")).toBeUndefined();
  });

  it("returns nothing for a version heading with no entries", () => {
    expect(releaseNotes("## [0.1.0] - 2026-10-24\n\n## [0.0.1]\n", "0.1.0")).toBeUndefined();
  });
});
