# Apply a plan

Apply a plan lets the agent carry out a plan the person agreed to: it changes the Chrome bookmarks, after writing a
backup of the whole tree that can bring them back.

## Sub-features

- `apply-ops` runs every operation type in order (`create` a folder or a bookmark, `move`, `rename`, `remove`), with
  each key replaced by the ID Chrome gave its node, and returns `backupId`, `applied`, `created` and the new
  `revision`.
- `apply-backup` writes `backups/<UTC time>.json` in the data folder (mode `0600`, folder `0700`) before the extension
  is asked to change anything, holding the tree before and the plan; a second in the same second gets `-2`.
- `apply-invalid` returns an invalid plan's `errors`, as `check_plan` does, writes no backup and changes nothing.
- `apply-stale` returns the whole-plan error (operation `-1`) when the tree changed, whether the server or the
  extension notices, and changes nothing.
- `apply-partial` stops at the first operation Chrome refuses: the ones before stay applied, and `failed` says which and
  why.
- `apply-positions` puts a node created or moved at an `index` where `check_plan`'s dry run said it lands.
- `apply-errors` says nothing changed when the backup cannot be written, and gives the backup's ID when the extension
  disconnects or does not answer after the backup.

## How to get to it (user POV)

- Call the MCP tool `apply_plan` with a plan: `{ "revision": "<from get_tree>", "operations": [...] }`. Claude Code
  asks the person before every call, since it is the only tool marked `destructiveHint`.

## Driving it

Preconditions:

- A build of the commit to prove (`npm ci && npm run build`), and Playwright's Chromium (`npx playwright install
  chromium`). Nothing else listens on port 47615, and no other checkout of this project is running its E2E tests: an
  extension in another checkout's test browser would connect to this run's server.
- The `dataDir` fixture in `e2e/fixtures.ts` gives the server a temporary `BOOKMARK_ORGANIZER_DATA_DIR`, so backups
  never go to the real data folder.

- **All four operation types.** `npx playwright test -c e2e apply-plan.e2e.ts`, test "apply_plan backs up the tree,
  applies all four operation types…": a plan of 7 operations returns `applied: 7` and `created` with `$reference` and
  `$page`; `chrome.bookmarks.getTree()` in the service worker then shows `Reading` holding `Example docs` before
  `Example: a made-up article`, and `Reference` in Other bookmarks holding `Example: a made-up page` and
  `example.com`; `Old` is gone. The backup's `tree` is the tree read with `chrome.bookmarks` before the call.
- **Invalid plan.** In the same test, the first step: removing the non-empty `Reading` returns `valid: false`, the tree
  is unchanged and `backups/` does not exist.
- **Partial.** The same test's last step: the person removes `Example docs` as soon as the plan's first operation
  creates `Inbox`, so operation 2, which moves it, fails: `applied: 2`, `failed.operation: 2`, `Inbox` exists,
  `example.com` is renamed and `Example: a made-up article` is not.
- **Positions.** Test "moves and creates at an index land where check_plan's dry run says": eight plans on a folder of
  `Example A` to `D`, each checked with `check_plan` and then applied; Chrome's order (`B A C D` for A to index 2, …)
  and the end of each dry-run line (`, before "Example C"`) agree.
- **Backup first.** Test "apply_plan writes the backup, 0600 in a 0700 folder, before it sends the operations": a Node
  WebSocket plays the extension and, when `applyOperations` arrives, finds exactly one backup, mode `600`, in a folder
  of mode `700`, and prints `ls -l`.
- **Errors.** The tests "…when the extension disconnects…", "…revision-mismatch…" and "…when the backup cannot be
  written" in the same file.
- **Proof.** Paste the `→ tools/call` and `← …` lines and the `ls -l` output in the pull request's Verification
  section. Keep `bookmarks-bar-after.png` and `reference-after.png` (screenshots of `chrome://bookmarks`) and the
  `tree-*.json` dumps from `artifacts/e2e/*apply-pl*/` in `artifacts/<branch>/`.

## Gotchas

- Read the tree before and after with `chrome.bookmarks` in the service worker, never with `get_tree`: both cross the
  same bridge, so `get_tree` could be wrong the same way `apply_plan` is.
- Nothing in a valid plan makes Chrome refuse an operation, since `check_plan` runs it on a copy first; a partial
  apply needs the tree to change while the plan runs, which the partial step does with a `chrome.bookmarks.onCreated`
  listener. That is a race between Chrome's event and its answer to the operation before; it has two operations'
  round trips of slack, and a failure there with `applied: 4` means the listener lost it, not that `apply_plan` is
  wrong.
- `chrome.bookmarks.move` within one folder counts the index before the node leaves it, and moving a node to its own
  index or the next one changes nothing (`move A to index 1` keeps `A B C D`).
- A stale plan the extension notices still leaves the backup written, though nothing was applied.
- `playwright.config.ts` empties `artifacts/e2e/` on every run: copy the evidence out before running again.
