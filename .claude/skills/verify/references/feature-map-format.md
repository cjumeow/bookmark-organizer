# Feature map format

The feature map is the list of what a user can do with bookmark-organizer, written so an agent that has never seen
the app can reach each feature, drive it, and prove it works. It lives in `.claude/skills/verify/features/`: an index
in `README.md` and one file per user-facing feature.

A user of this product is an agent following the organizer skill, or a person watching the extension, so a feature is
something they can do: read the bookmark tree, preview a plan, apply it, restore a backup. Internal parts (the plan
validator, the bridge's message handling) are not features; they are proven through the features that use them.

## The index

`features/README.md` has one row per feature:

```markdown
| Feature | File | Surfaces | Status |
|---|---|---|---|
| Apply a plan | [apply-plan.md](apply-plan.md) | MCP tool `apply_plan`, extension | proven in #12 |
```

`Status` is `planned`, `built`, or `proven in #<pull request>`: the last pull request whose Verification section
proved every journey in the file. Name the pull request, not a commit: pull requests are squash-merged and their
branches deleted, so a branch commit's SHA does not survive the merge.

## A feature file

The file is named for what the user does, in kebab-case (`apply-plan.md`). It opens with a title and one paragraph,
from the user's point of view, on what the feature is for. Then four sections, always these, in this order:

- `## Sub-features`: each separate thing the feature does, one line each, with a short id.
- `## How to get to it (user POV)`: every entry point a user has, such as an MCP tool call or a button in the
  extension's popup. A proof covers all of them.
- `## Driving it`: the preconditions, then one bold step per action, each with the exact command to run and the
  observable result that shows it worked. The last step is **Proof**: what to capture, where, and what it must show.
- `## Gotchas`: what makes a run fail or mislead: ordering, timing, seed data it needs, and proof that looks
  sufficient but is not.

Commands are the real ones from this repository, never placeholders. Observations name a concrete value ("the folder
`Design` holds 3 bookmarks"), not "it works".

## Example

An example for a feature this product will have. The commands are illustrative until the app exists; a real feature
file uses the recorded recipe.

```markdown
# Apply a plan

Apply a plan lets the agent change many bookmarks in one call, after previewing the change, with a backup it can
restore.

## Sub-features

- `apply-dry-run` shows what a plan would change without changing anything.
- `apply-run` backs up the tree, then applies the plan's operations in order.
- `apply-invalid` refuses a plan that refers to a missing bookmark, changing nothing.

## How to get to it (user POV)

- Call the MCP tool `apply_plan` with `dryRun: true`, then with `dryRun: false`.

## Driving it

Preconditions:

- The built MCP server and extension are running in an isolated browser, and the bridge reports `connected`.
- The tree is seeded from `fixtures/small-tree.json`: 6 bookmarks on `example.com` in Other Bookmarks.

- **Preview.** Call `apply_plan` with `fixtures/plan-two-folders.json` and `dryRun: true`. The response lists
  "create 2 folders, move 6 bookmarks", and the tree read with `chrome.bookmarks.getTree()` is unchanged.
- **Apply.** Call it again with `dryRun: false`. The response lists 8 applied operations and a backup id.
- **Refuse an invalid plan.** Call it with `fixtures/plan-missing-id.json`. The response is an error naming the
  missing id, and the tree is unchanged.
- **Proof.** Save the tree before and after as `artifacts/<branch>/apply-plan/tree-before.json` and
  `tree-after.json`, and a screenshot of `chrome://bookmarks`. They show the folders `Docs` and `Tools` with 3
  bookmarks each.

## Gotchas

- The dry run's summary alone proves nothing about applying; read the tree after the real run.
- Moving a bookmark within its own folder shifts its siblings' indexes; compare titles and order, not indexes.
- Remove the seeded profile during cleanup, but keep the artifacts.
```
