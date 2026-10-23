# Read the tree

Read the tree lets the agent see the person's Chrome bookmarks, with the revision its plan must carry, before it
decides names and folders: the whole tree, one folder, or an outline of a tree too large for one tool result.

## Sub-features

- `read-whole` returns every special folder and what is inside it, with the revision of the whole tree.
- `read-folder` with `folderId` returns only that folder and what is inside it, with the same whole-tree revision.
- `read-outline` returns the folders without their bookmarks, each with `bookmarkCount`, when the requested tree's
  JSON would pass 80,000 characters.
- `read-unknown-folder` says a `folderId` that names no folder does not exist.
- `read-errors` says what to do when Chrome cannot be reached, another session holds the bridge's port, or the
  extension's version differs or it disconnects.

## How to get to it (user POV)

- Call the MCP tool `get_tree`, with no arguments or with `{ "folderId": "<a folder's ID>" }`.

## Driving it

Preconditions:

- A build of the commit to prove (`npm ci && npm run build`), and Playwright's Chromium (`npx playwright install
  chromium`). Nothing else listens on port 47615.

- **Read the whole tree.** `npx playwright test -c e2e tools.e2e.ts`, step "get_tree returns the whole tree and its
  revision": the seeded Bookmarks bar holds `Reading` (`Example article`, `Example docs`) and `example.com`, every
  special folder has `folderType` and `syncing: false`, and the revision is 16 hexadecimal characters. The first call
  returns after about 30 seconds, on the extension's alarm.
- **Read an outline.** Step "get_tree returns an outline when the tree is too large": after 1,000 bookmarks are added
  to Other bookmarks/`Archive`, the response is under 2,000 characters, `Archive` has `bookmarkCount: 1000`, `Reading`
  has `bookmarkCount: 2`, and the revision differs from the first.
- **Read one folder.** Step "get_tree with a folderId returns that folder": `{ "folderId": <Reading's ID> }` returns
  `tree: [Reading]` with its two bookmarks, though the whole tree is too large.
- **Ask for a folder that does not exist.** Step "get_tree with an unknown folderId…": `{ "folderId": "999999" }`
  returns `isError: true` with `Folder 999999 does not exist.`
- **Errors without Chrome.** `npx playwright test -c e2e tool-errors.e2e.ts`: with no extension, `get_tree` returns
  `Chrome is not reachable: open Chrome with the Bookmark Organizer extension turned on.` after 40 to 45 seconds; with
  the port taken, `Another session is using the bridge; finish there or close it.`; with an extension of version
  `0.0.0`, `Update the extension (version 0.0.0) to match the server (version <its version>).`
- **Proof.** Paste the `→ tools/call` and `← …` lines each test prints (also in `artifacts/e2e/*/mcp-transcript.txt`)
  in the pull request's Verification section.

## Gotchas

- The special folders' titles follow the browser's language (`書籤列` on a Chinese system), and Playwright's
  Chromium has no Mobile bookmarks folder until something is put there; the test reads both from `chrome.bookmarks`
  rather than writing them down.
- The outline is chosen by size alone, so a seed of a few dozen bookmarks never shows it.
- `get_tree` reporting a tree proves nothing about what Chrome holds; compare it with
  `serviceWorker.evaluate(() => chrome.bookmarks.getTree())`.
- The extension connects only on its 30-second alarm after the listener opens, so a first call that returns at once
  came from a server that was already connected.
