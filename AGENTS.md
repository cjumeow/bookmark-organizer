# Bookmark Organizer

A Chrome extension and a local MCP server that let a coding agent read and reorganize the user's Chrome bookmarks
through Chrome's own `chrome.bookmarks` API, plus a skill that holds the rules for naming sites and choosing folders.
The agent decides how bookmarks should be named and filed; the extension and the server carry the decision out
exactly.

Status: planning. There is no code yet. The spec and the glossary come next, in `docs/`.

## A learning project

The developer builds this to learn how to run a project with coding agents: CI/CD, lint rules and conventions,
skills, agent files, testing. So besides doing the task:

- When you introduce a tool, a configuration, a convention or a workflow (a lint rule, a GitHub workflow, a hook, a
  skill, a Claude Code feature), explain it to the developer: what it is, what problem it solves, and the alternative
  you did not pick and why. Keep it short.
- Prefer what Claude Code already has (built-in commands, hooks, subagents, worktrees, skills) over writing something
  new, and say which one you used.
- Record a decision that shapes the project as a short ADR in `docs/adr/NNNN-<title>.md`: the context, the decision,
  the consequences. Create the folder with the first one.
- When a practice is worth reusing in other projects, propose turning it into a skill. Do not create one unasked.

Talk with the developer in Traditional Chinese (繁體中文). Everything in the repository (code, docs, commit messages,
pull requests) is in English.

## Principles that shape the design

- **The agent judges, the program executes.** Naming and filing bookmarks is the agent's work, guided by the skill.
  The extension and the MCP server never call a language model: they read the bookmark tree, validate a plan, and
  apply it exactly.
- **Whole plans, not one call per bookmark.** Tools take and return whole trees and plans (read the tree; apply a
  plan, with a dry run that shows what would change), so reorganizing a hundred bookmarks is one call, not a hundred.
- **Nothing changes without a backup.** Applying a plan backs up the tree first, and a backup can be restored.
- **Bookmarks stay on the computer.** The bridge between the MCP server and the extension listens only on this
  computer and accepts only this extension.
- **One name per concept** in code, tools, docs and the skill. Terms are defined in `docs/glossary.md` as they are
  decided.
- **A rule a program can check is checked by a program** (a lint rule, a script, a CI step), not only written down.
  Rules that need judgment stay in skills and in review.

## Where things go

Planned layout; update this table when it changes.

| Looking for | Place |
|---|---|
| The Chrome extension (manifest, background service worker) | `extension/` |
| The MCP server and its tools | `mcp-server/` |
| The skill that organizes bookmarks, for users | `skills/bookmark-organizer/` |
| Skills for developing this repository | `.claude/skills/<name>/SKILL.md` (other agents read them through the `.agents/skills` link) |
| What changed for users, release by release | `CHANGELOG.md` |
| Spec, glossary, design decisions | `docs/`, `docs/glossary.md`, `docs/adr/` |
| GitHub workflows | `.github/workflows/<verb>-<object>.yml` |

## Skills and commands to use

| Before you | Use |
|---|---|
| commit, push a branch, or open or merge a pull request | [`commit-and-pull-request-convention`](.claude/skills/commit-and-pull-request-convention/SKILL.md) |
| open a pull request | `/code-review` on the change |
| change the bridge, a network listener, or the extension's permissions | `/security-review` |
| finish a change that grew larger than planned | `/simplify` |
| create or change a skill | `skill-creator` |

Add a row when a skill is added under `.claude/skills/`. List only skills that exist.

## Workflow

- Work on a branch from `main`, one issue per branch, and open a pull request. Pull requests are squash-merged, so the
  title becomes the commit on `main`. How to write branches, commits, the changelog and pull requests is in
  [`commit-and-pull-request-convention`](.claude/skills/commit-and-pull-request-convention/SKILL.md).
- Keep pull requests small enough to read in one sitting. Never merge code you cannot explain.
- A change to what a document in `docs/` describes updates that document in the same pull request.

## Trying a change

Try a change from a build of a commit, never from the working tree: load the extension from a build output and
register the MCP server from a build, so a half-edited file never runs and every result can be traced to a commit.
The scripts for this come with the code.

## Commands

None yet. The toolchain (TypeScript, ESLint, Prettier, Vitest, Playwright) comes with the first code; its commands go
here, the same ones CI runs.
