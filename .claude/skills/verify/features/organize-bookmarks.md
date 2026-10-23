# Organize bookmarks

Organize bookmarks lets a person ask their agent to clean up their Chrome bookmarks: the agent, following the
organizer skill, names every bookmark `Name: short description`, files it into folders, shows the changes and applies
them only after the person agrees, and restores a backup when asked.

## Sub-features

- `organize-name` renames every bookmark whose site it could read to `Name: short description`.
- `organize-check` opens sites whose title and URL do not say what they are, and reports the ones it cannot open.
- `organize-folders` files bookmarks into folders of three or more, with one catch-all folder for the rest.
- `organize-duplicates` keeps one copy of each duplicate bookmark.
- `organize-storage` never moves a node between local and account storage.
- `organize-agree` shows `check_plan`'s changes and calls `apply_plan` only after the person agrees.
- `organize-restore` restores a backup with `list_backups`, `get_restore_plan`, `check_plan` and `apply_plan`.

## How to get to it (user POV)

- Ask the agent, in words, to organize, clean up or restore bookmarks, with the skill in
  `skills/bookmark-organizer/` available to it and the MCP server connected.

## Driving it

The organizer skill is written, and `get_tree` and `check_plan` are built, but `apply_plan` and the restore tools are
not, so the feature is `planned`. Until they are, the skill is driven against a simulation of the tools and the web.

Preconditions:

- Node.js 24, and the evaluation cases in `skills/bookmark-organizer/evals/`: five made-up bookmark trees on
  `example.com`, each with its prompt, its expected outcome and its graders.

- **Run each case with and without the skill.** Copy the case's `files/fixture.json` and `evals/simulate-tools.mjs`
  into an empty folder and give an agent the case's `prompt.md`, once with the skill and once without; or, with
  Claude Code, run `claude plugin eval . --scaffold --allow-tools Write,Edit,Bash` from `skills/bookmark-organizer/`.
  The folder's `tool-calls.log` records every tool call and site opened.
- **Grade.** Check each run against the case's `graders/`: the last plan passed to `check_plan` is valid,
  `apply_plan` was never called, renamed titles follow `Name: short description`, and no move crosses storages.
- **Proof.** Keep the runs in `artifacts/<branch>/skill-eval/`, and paste the pass rates with and without the skill
  in the pull request. With the skill, every case passes every grader.

## Gotchas

- The simulator is a test double that follows `docs/spec.md`; a plan it accepts can still be refused by the real
  `check_plan`. Once the MCP server runs, also drive the flow end to end against the built extension.
- Every site in the fixtures is on `example.com`, so the agent cannot know any of them: it must open them. Never point
  a run at real bookmarks or real sites.
- A run cannot get the person's agreement, so a correct run ends on the question; a run that calls `apply_plan` fails.
