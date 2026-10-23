# Bookmark Organizer

A Chrome extension and a local MCP server that let a coding agent read and reorganize the user's Chrome bookmarks
through Chrome's own `chrome.bookmarks` API, plus a skill that holds the rules for naming sites and choosing folders.
The agent decides how bookmarks should be named and filed; the extension and the server carry the decision out
exactly.

Status: skeleton. Both programs build and start, but neither does anything yet. The spec and the glossary come next,
in `docs/`.

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

Update this table when the layout changes. Rows marked (planned) do not exist yet.

| Looking for | Place |
|---|---|
| The Chrome extension: `manifest.json`, the background service worker in `src/background.ts` | `extension/` |
| The MCP server and its tools, starting from `src/index.ts` | `mcp-server/` |
| Shared TypeScript settings, lint and format rules | `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json` |
| Repository checks that are not lint rules, with their tests | `scripts/` |
| The skill that organizes bookmarks, for users (planned) | `skills/bookmark-organizer/` |
| Skills for developing this repository | `.claude/skills/<name>/SKILL.md` (other agents read them through the `.agents/skills` link) |
| What changed for users, release by release | `CHANGELOG.md` |
| How to prove a change, and the map of user-facing features | `.claude/skills/verify/`, `.claude/skills/verify/features/` |
| Verification evidence files, kept on this computer and ignored by git | `artifacts/<branch>/` |
| Design decisions | `docs/adr/` |
| Spec and glossary (planned) | `docs/spec.md`, `docs/glossary.md` |
| GitHub workflows | `.github/workflows/<verb>-<object>.yml` |

## Skills and commands to use

| Before you | Use |
|---|---|
| commit, push a branch, or open or merge a pull request | [`commit-and-pull-request-convention`](.claude/skills/commit-and-pull-request-convention/SKILL.md) |
| say a change works, or write a pull request's Verification section | [`verify`](.claude/skills/verify/SKILL.md) |
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

## Proving a change

A change is done when it is proven on the real thing, not when it compiles or its tests pass: run a build of a
commit, never the working tree, observe the result, and put the evidence in the pull request's Verification section.
What counts as proof for each kind of change, how to drive the app in isolation, and the feature map are in
[`verify`](.claude/skills/verify/SKILL.md).

## Commands

Node.js 24 (`.nvmrc`). Why the toolchain is what it is: [ADR 1](docs/adr/0001-typescript-toolchain.md).

```bash
npm install
npm run check            # everything CI runs, in order: the commands below
npm run format:check     # Prettier; `npm run format` fixes it
npm run lint             # ESLint with type-aware rules
npm run typecheck        # tsc in both workspaces
npm test                 # Vitest
npm run check:versions   # one version in package.json, both workspaces and extension/manifest.json
npm run build            # extension/dist/ and mcp-server/dist/
```

Dependencies are pinned to exact versions. The version lives in four files; change all four together.
