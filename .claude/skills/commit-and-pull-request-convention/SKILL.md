---
name: commit-and-pull-request-convention
description: How commits and pull requests are written in bookmark-organizer, covering branch names, Conventional Commits subjects, commit bodies, the changelog, and pull request titles and descriptions. Use before committing, writing or rewording a commit message, pushing a branch, or opening, describing or merging a pull request in this repository, even for a one-line change.
---

# Commits and pull requests

A pull request is squash-merged: one change becomes one commit on `main`. Its subject is the pull request title, and
its body is the messages of the pull request's commits. Write both for someone who never saw the conversation: the
chat with the agent is gone after the session, and the history on `main` is what stays.

The rules a program can check (the title format, the changelog entry) belong in a CI workflow. Until that workflow
exists, check them yourself before pushing.

## Branches

- Work on a branch from `main`, named `<type>/<topic>` in kebab-case, with a type from the table below:
  `feat/apply-plan-dry-run`, `fix/duplicate-folders`.
- Commit locally as you go. Before pushing, squash the work-in-progress commits into the ones a reviewer should read
  (usually one, whose message is the one `main` should get), and run the commands in `AGENTS.md`.
- Nothing private enters the repository, in code, fixtures, commit messages or pull requests: the user's real
  bookmarks (their URLs, titles and folder names), names of people, local paths, tokens. The repository is public, and
  a bookmark list shows what a person reads. Tests and examples use made-up bookmarks on `example.com`.

## Commit messages

- **Subject:** [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), `<type>: <sentence>`, no scope.
  The sentence is English in the imperative (it completes "this commit will ..."), starts lowercase, has no trailing
  period, and fits in 72 characters, where GitHub starts cutting titles. It says what changes for the user or the
  agent; add the reason after a comma when it is not obvious.
- **Type:**

  | Type | When |
  |---|---|
  | `feat` | a user or the agent can do something they could not before: a new tool, option or rule |
  | `fix` | something that should already have worked now does |
  | `refactor` | the code changes and nothing anyone sees does |
  | `docs` | documentation, `AGENTS.md` and the skills in `.claude/skills/`, for developers |
  | `test` | tests only |
  | `ci` | the workflows in `.github/workflows/` |
  | `chore` | anything else, such as a release or a dependency update |

  The skill in `skills/bookmark-organizer/` is part of the product, so a change to how it names or files bookmarks is
  a `feat` or a `fix`, not `docs`.

  ```text
  feat: apply a plan with a dry run that lists every change first
  fix: keep a bookmark's position when it moves within its folder
  feat: back up the bookmark tree before applying a plan, so a bad plan can be undone
  refactor: move plan validation out of the bridge
  chore: release 0.2.0
  ```

  Not `feat: added dry run` (past tense), `fix: folder bug` (no verb), `chore: update stuff` (says nothing),
  `fix: edit bridge.ts and plan.ts` (files, not the change), or `feat(extension): add popup` (no scope).
- **Body,** when the subject is not enough: prose wrapped at 120 columns that says what was wrong or missing and what
  happens now. Not a list of the files edited, and not the story of how the fix was found.
- Use the terms in `docs/glossary.md` and the code's names. Name every MCP tool, plan field and extension permission
  that changes, since the agent and the skill depend on them.
- **Trailers:** a commit an agent wrote ends with the agent's `Co-Authored-By:` trailer. Commits are not signed off.

## Changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the release notes are made from
it, so it is written in the pull requests rather than at release time.

- A `feat` or `fix` adds an entry under `## [Unreleased]`, in its category: Added, Changed, Deprecated, Removed, Fixed
  or Security. Write it for a user: what is different for them, not how the code changed. Other types get no entry;
  a change a user or the agent would notice is a `feat` or a `fix`.
- An entry is one line, two at most: the thing the user meets (an MCP tool, the extension, a rule of the skill), what
  is different, and a short example when it says more than an explanation would. The reason, how it works, edge cases
  and trade-offs go in the pull request. Not "`apply_plan` now reads the tree with `chrome.bookmarks.getTree` before
  moving anything and sends it over the bridge to be written as a timestamped JSON file, retrying once when ..." but
  "`apply_plan` backs up the bookmark tree first, and `restore_backup` puts it back."
- Only a release pull request adds a version heading and changes the version.

## Pull requests

- **Title:** the subject `main` should get, in the format above.
- **Description:** written for the reviewer deciding whether to merge, and for whoever later follows the commit back
  to it. Up to four sections, each answering one question, in this order:

  | Section | Answers | Holds |
  |---|---|---|
  | `## Why` | Is the problem worth solving? | what was wrong or missing |
  | `## What changes` | Is this the right change, and where to look? | what is different for a user or the agent: tools, plan fields, rules |
  | `## Trade-offs` | Is the price acceptable? | what gets worse, what was given up, the alternative not taken |
  | `## Verification` | Is the risk acceptable? | each claim with its evidence and how sure it is, what is still unchecked, what to watch for |

  Why, What changes and Verification are always there: a passing CI run does not show that a change was proven, and
  what counts as evidence is in [`verify`](../verify/SKILL.md). Leave Trade-offs out when nothing was given up; never
  fill a section for its own sake.
- **What changes** opens with one or two sentences that say what the change is as a whole; a single change ends
  there. Several separate changes follow as one level of bullets, each starting with the bold name of the thing that
  changes (a tool, a file, a rule) and one sentence on how. Items that share attributes go in a table. No file lists,
  no nested bullets, and no order of implementation.
- The description ends with the agent's generated-with line when an agent wrote it.
- Before opening the pull request, run `/code-review` on the change.
- The developer reviews and merges. Do not merge a pull request unless the developer asks you to.

An example:

```markdown
## Why

Applying a plan changes many bookmarks at once, and a wrong plan could only be undone by hand.

## What changes

`apply_plan` writes a backup of the whole bookmark tree before it changes anything, and the new `restore_backup` tool
puts a backup back.

## Trade-offs

Each backup holds the whole tree, so backups grow with the number of bookmarks. Only the last 10 are kept.

## Verification

Not run: restoring a tree of several thousand bookmarks. The E2E test restores 50.
```
