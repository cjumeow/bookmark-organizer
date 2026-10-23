# Restore a backup

Restore a backup lets the person undo a plan: `list_backups` shows the backups `apply_plan` took, and
`get_restore_plan` turns one into a plan that brings the tree back, which then goes through `check_plan` and
`apply_plan` like any other plan, so the restore is checked, backed up first and can itself be restored.

## Sub-features

- `restore-list` lists the backups newest first, each with `id`, `createdAt`, `bookmarks`, `folders` and the
  `operations` of the plan applied after it, without Chrome and without opening the bridge's port.
- `restore-plan` returns `{ plan: { revision, operations }, skipped }`, matching nodes by ID, kind and URL: nodes still
  there are moved and renamed back, removed ones are created again with `$restore-<old ID>` keys, bookmarks added since
  stay after the restored nodes, and folders not in the backup are removed when the restore leaves them empty.
- `restore-apply` applies that plan with `apply_plan`: the tree then equals the backup but for the IDs of the nodes
  created again, and the restore wrote its own backup.
- `restore-skipped` lists in `skipped` the nodes a plan cannot restore, with why: a special folder that is gone, a node
  now in the other storage, and an empty title, which a plan cannot set.
- `restore-errors` says an unknown backup does not exist, at once, without waiting for Chrome.

## How to get to it (user POV)

- Ask the agent to undo a reorganization. It calls `list_backups`, then `get_restore_plan` with the `backupId` that
  `apply_plan` returned or the one `list_backups` shows, then `check_plan` with the plan, shows the person the changes
  and `skipped`, and calls `apply_plan` once they agree. Claude Code asks before `apply_plan` only: the other two are
  marked `readOnlyHint`.

## Driving it

Preconditions: as for [Apply a plan](apply-plan.md): a build of the commit to prove, Playwright's Chromium, nothing else
on port 47615, and the `dataDir` fixture's temporary `BOOKMARK_ORGANIZER_DATA_DIR`.

- **Restore.** `npx playwright test -c e2e restore-backup.e2e.ts`: a plan of 6 operations reorganizes made-up
  bookmarks on `example.com` (creates `Reference`, moves `example.com` into it, reorders `Reading`, renames
  `Example article`, removes `Old` and its bookmark); `list_backups` shows its backup; `get_restore_plan` returns the
  6 operations that undo it and no `skipped`; `check_plan` passes it; `apply_plan` applies it. The tree read with
  `chrome.bookmarks.getTree()` in the service worker then equals the tree before the reorganization with the IDs of
  `Old` and `Example old page` replaced by the ones in `created`. `list_backups` then shows two backups, the
  restore's first, and `get_restore_plan` of the restore's backup returns a valid plan with nothing skipped.
- **Listing without Chrome, unknown backup.** `npx playwright test -c e2e tool-errors.e2e.ts`, the tests
  "list_backups answers without Chrome…" and "get_restore_plan says an unknown backup does not exist…": `{ backups:
  [] }` with port 47615 closed, and `Backup 2026-10-23T14-05-00Z does not exist.` (also for `../../etc/passwd`)
  within 5 seconds.
- **Restore rules.** `npx vitest run mcp-server/src/restore-plan.test.ts`: one test per rule of
  `docs/spec.md#get_restore_plan`, the skipped cases, and a restore plan `checkPlan` passes.
- **Proof.** Paste the `→ tools/call` and `← …` lines of `get_restore_plan` and both `list_backups` in the pull
  request's Verification section. Keep `tree-original.json`, `tree-reorganized.json`, `tree-restored.json`,
  `restore-plan.json` and `list-backups.json` from `artifacts/e2e/restore-backup.e2e.ts-*/` in `artifacts/<branch>/`.

## Gotchas

- Nodes created again get new IDs and today's date: Chrome lets an extension choose neither. Compare trees with those
  IDs mapped through `created`, never by equality on the raw IDs.
- Skipped nodes need two storages, which Playwright's Chromium does not have without a signed-in Google Account, so
  `restore-skipped` is proven by the unit tests only.
- `playwright.config.ts` empties `artifacts/e2e/` on every run: copy the evidence out before running again.
