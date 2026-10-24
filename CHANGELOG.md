# Changelog

All notable changes to Bookmark Organizer are in this file, in the format of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- A Claude Code plugin that installs the MCP server and the organizer skill together, at one version:
  `/plugin marketplace add cjumeow/bookmark-organizer`, then `/plugin install bookmark-organizer@cjumeow`.

## [0.1.1] - 2026-10-24

### Fixed

- The npm page of `bookmark-organizer-mcp` shows the README, with links that work there.
- `npx bookmark-organizer-mcp` no longer fails with "Permission denied" when run inside a clone of this repository.

## [0.1.0] - 2026-10-24

### Added

- The MCP tools `list_backups`, which lists the backups `apply_plan` took, and `get_restore_plan`, which turns one
  into a plan that brings your bookmarks back; you check and apply it like any other plan, so a restore is backed up
  too and can be undone.
- The MCP tool `apply_plan`, which applies a plan to your bookmarks after backing up the whole tree to a file only you
  can read (on macOS in `~/Library/Application Support/bookmark-organizer/backups/`), and stops at the first failure.
- The MCP tools `get_tree`, which reads your bookmark tree (one folder of it, or an outline when it is large), and
  `check_plan`, which shows line by line what a plan would change, without changing anything.
- The extension connects to the MCP server over a WebSocket on `127.0.0.1:47615` and answers it with your bookmark
  tree; the server accepts only this extension and refuses web pages.
- The organizer skill, `skills/bookmark-organizer/`: it names every bookmark `Name: short description`, with the
  description in English, files bookmarks into folders with one catch-all folder, and shows the changes for your
  agreement before applying them.
