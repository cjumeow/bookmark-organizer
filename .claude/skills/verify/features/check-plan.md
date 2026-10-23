# Check a plan

Check a plan lets the agent find out, before anything changes, whether a plan is valid against the current tree and
what it would do, in lines it can show the person for their agreement.

## Sub-features

- `check-dry-run` returns a valid plan's summary and one line per operation; a `create` or `move` with an `index`
  says where the node lands.
- `check-errors` returns every broken rule of an invalid plan at once, each with its operation's index.
- `check-stale` refuses a plan whose revision is not the current tree's, as operation `-1`.
- `check-input` refuses a plan that does not fit the plan format, such as an operation with a misspelled field.
- `check-unchanged` changes nothing in Chrome.

## How to get to it (user POV)

- Call the MCP tool `check_plan` with a plan: `{ "revision": "<from get_tree>", "operations": [...] }`.

## Driving it

Preconditions:

- A build of the commit to prove (`npm ci && npm run build`), and Playwright's Chromium (`npx playwright install
  chromium`). Nothing else listens on port 47615.

- **Dry run.** `npx playwright test -c e2e tools.e2e.ts`, step "check_plan returns the dry run…": a plan that creates
  `$reference` in Other bookmarks, moves `example.com` into it, moves `Example docs` to index 0 of `Reading` and renames
  `Example article` returns `valid: true`, the summary `foldersCreated: 1, moved: 2, renamed: 1`, and four lines, the
  third ending `, before "Example article"`.
- **Nothing changes.** In the same step, `chrome.bookmarks.getTree()` read in the service worker is equal before and
  after the call.
- **Broken rules.** Step "check_plan reports every broken rule…": removing the non-empty `Reading` and moving the
  Bookmarks bar return `valid: false` with two errors, operations 0 and 1.
- **Stale plan.** Step "check_plan refuses a plan written against an older tree": after bookmarks are added, the first
  revision returns `{ "operation": -1, "message": "The bookmarks changed; call get_tree again and rewrite the plan." }`.
- **Bad input and a lost extension.** `npx playwright test -c e2e tool-errors.e2e.ts`: an operation with `idx` returns
  `isError: true` naming `"idx"`; an extension that disconnects on `getTree` returns `The extension disconnected before
  it answered.`
- **Proof.** Paste the `→ tools/call` and `← …` lines each test prints (also in `artifacts/e2e/*/mcp-transcript.txt`)
  in the pull request's Verification section.

## Gotchas

- `check_plan` reads the tree afresh on every call, so a plan is checked against Chrome as it is now, not as the agent
  last read it; a valid result from before a change in Chrome is stale.
- A stale revision is a broken rule in `errors`, not an MCP error result, so it comes back beside the plan's other
  broken rules.
- Paths start with the special folder's title in the browser's language; with both storages, they also say
  `(local)` or `(account)`, which a profile without a Google Account never shows.
