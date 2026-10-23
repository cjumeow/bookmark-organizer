---
name: run-bookmark-organizer
description: How to launch bookmark-organizer in isolation and drive it, covering building a commit, loading the built extension in Playwright's own Chromium with a temporary profile seeded with made-up bookmarks, opening the bridge, the readiness check and the teardown. Use when asked to run, start or drive the extension or the bridge, or to prove a change in the running app.
---

# Run bookmark-organizer

The app is two programs: the MCP server, which listens on the bridge (`ws://127.0.0.1:47615`) while a tool needs
Chrome, and the extension, whose service worker connects to it. The recipe below runs both without touching the
developer's own Chrome, profile or bookmarks. Why each rule exists is in [`verify`](../verify/SKILL.md).

## Once per computer

```bash
npm install
npx playwright install chromium
```

Playwright downloads its own Chromium (the full browser, which `channel: "chromium"` uses to load extensions in
headless mode) into its cache, apart from any Chrome installed.

## Build a commit

Run a build of a commit, never the working tree. A clean checkout of the commit to prove:

```bash
git worktree add --detach ../bookmark-organizer-proof <commit>
cd ../bookmark-organizer-proof && npm ci && npm run build
```

`extension/dist/` is then the unpacked extension and `mcp-server/dist/` the server.

## Launch and drive

```bash
npm run test:e2e
```

This runs `e2e/*.e2e.ts` with the fixtures in `e2e/fixtures.ts`:

1. **Browser.** `chromium.launchPersistentContext` on a new temporary profile (`$TMPDIR/bookmark-organizer-e2e-*`),
   with `--load-extension=extension/dist`. The `serviceWorker` fixture is the extension's worker, at
   `chrome-extension://ancijliidboahicggjggbhlflehlnbjg/background.js`.
2. **Seed.** `serviceWorker.evaluate(() => chrome.bookmarks.create(...))` adds made-up bookmarks on `example.com`.
3. **Server.** The `mcp` fixture starts the built server, `mcp-server/dist/index.js`, with the MCP SDK's client over
   stdio, as Claude Code starts it. `mcp.call("get_tree")` opens the bridge's listener and waits for the extension;
   every request and response goes to the test's output and to its `mcp-transcript.txt` attachment.
4. **Observe** outside the bridge with `serviceWorker.evaluate(() => chrome.bookmarks.getTree())`.

To drive something new, add a test beside `e2e/tools.e2e.ts` that uses the same fixtures. A test that needs the
extension to misbehave (another version, a disconnect) plays it with a Node `ws` client instead of the browser, as
`e2e/tool-errors.e2e.ts` does.

## Readiness

- The extension is loaded when the `serviceWorker` fixture resolves and its URL has the ID above.
- The bridge is ready when the first tool call that needs Chrome returns. The extension tried to connect when it was
  installed, before anything listened, so it connects on its next alarm: expect about 30 seconds (the run on this
  computer took 30).

## Teardown

The fixtures close the browser and delete the temporary profile, and close the MCP client, which ends the server and
frees the port, even when a test fails. Kill only processes you started, by their PID, never by name. Evidence stays:
`artifacts/e2e/` holds each test's attachments (`mcp-transcript.txt`) and, on failure, its error context.

## Gotchas

- Port 47615 is fixed. If a real MCP server of this project is running, the test's server fails with "Another session
  is using the bridge"; and a Chrome of yours with the extension loaded would connect to the test's server. Close
  both before running.
- The special folders' titles follow the browser's language (`其他書籤` for Other bookmarks on a Chinese system); match
  them by `folderType`, never by title.
- The headless shell (`chromium-headless-shell`) does not load extensions; the fixture asks for `channel: "chromium"`.
