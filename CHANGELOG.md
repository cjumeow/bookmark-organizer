# Changelog

All notable changes to Bookmark Organizer are in this file, in the format of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The MCP tools `get_tree`, which reads your bookmark tree (one folder of it, or an outline when it is large), and
  `check_plan`, which shows line by line what a plan would change, without changing anything.
- The extension connects to the MCP server over a WebSocket on `127.0.0.1:47615` and answers it with your bookmark
  tree; the server accepts only this extension and refuses web pages.
- The organizer skill, `skills/bookmark-organizer/`: it names every bookmark `Name: short description`, with the
  description in English, files bookmarks into folders with one catch-all folder, and shows the changes for your
  agreement before applying them.
