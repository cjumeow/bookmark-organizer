# Only `apply_plan` changes bookmarks; dry runs and restores are read-only tools

Date: 2026-10-23. Status: accepted.

Claude Code grants permission per tool, so a person can allow a read-only tool once and keep being asked before
anything changes. A dry run is therefore its own tool, `check_plan`, rather than a flag on `apply_plan`: with a flag,
the person would either be asked for every dry run or allow every real apply too. Restoring follows the same path:
`get_restore_plan` computes a plan from a backup, and that plan goes through `check_plan` and `apply_plan` like any
other, so a restore is checked, backed up first and can itself be restored. There is no `restore_backup` tool.

## Consequences

- `apply_plan` is the only tool that changes bookmarks and the only one that takes a backup.
- Recreating a removed bookmark needs an operation that creates a bookmark, so `create` makes a bookmark when it has a
  URL and a folder when it does not, although the organizer skill only ever creates folders.
