# Bookmark Organizer

A Chrome extension and a local MCP server that let a coding agent read and reorganize the user's Chrome bookmarks
through Chrome's own `chrome.bookmarks` API, plus a skill that holds the rules for naming sites and choosing folders.
The agent decides how bookmarks should be named and filed; the extension and the server carry the decision out
exactly.

Status: being built. The MCP server has all the tools of the first version: the read-only `get_tree`, `check_plan`,
`list_backups` and `get_restore_plan`, and `apply_plan`, which backs up the tree and has the extension apply a plan.
What the first version does (the MCP tools, the plan format, the bridge protocol and backups) is in the spec, `docs/spec.md`, and the features
are built from it.

## A learning project

The developer builds this to learn how to run a project with coding agents: CI/CD, lint rules and conventions,
skills, agent files, testing. So besides doing the task:

- When you introduce a tool, a configuration, a convention or a workflow (a lint rule, a GitHub workflow, a hook, a
  skill, a Claude Code feature), explain it to the developer: what it is, what problem it solves, and the alternative
  you did not pick and why. Keep it short.
- Prefer what Claude Code already has (built-in commands, hooks, subagents, worktrees, skills) over writing something
  new, and say which one you used.
- Record a decision as a short ADR in `docs/adr/NNNN-<title>.md` when it is hard to reverse, surprising without
  context, and the result of a real trade-off. The format and the test are in
  [`ADR-FORMAT.md`](.claude/skills/domain-modeling/ADR-FORMAT.md).
- When a practice is worth reusing in other projects, propose turning it into a skill. Do not create one unasked.

Talk with the developer in Traditional Chinese (繁體中文). Everything in the repository (code, docs, commit messages,
pull requests) is in English.

## Principles that shape the design

- **The agent judges, the program executes.** Naming and filing bookmarks is the agent's work, guided by the skill.
  The extension and the MCP server never call a language model: they read the bookmark tree, validate a plan, and
  apply it exactly.
- **Whole plans, not one call per bookmark.** Tools take and return whole trees and plans (read the tree; check a
  plan, with a dry run that shows what would change; apply it), so reorganizing a hundred bookmarks is one call, not a
  hundred.
- **Nothing changes without a backup.** Applying a plan backs up the tree first, and a backup can be restored.
- **Bookmarks stay on the computer.** The bridge between the MCP server and the extension listens only on this
  computer and accepts only this extension.
- **One name per concept** in code, tools, docs and the skill. Terms are defined in `GLOSSARY.md` as they are
  decided.
- **A rule a program can check is checked by a program** (a lint rule, a script, a CI step), not only written down.
  Rules that need judgment stay in skills and in review.

## Where things go

Update this table when the layout changes. Rows marked (planned) do not exist yet.

| Looking for | Place |
|---|---|
| The Chrome extension: `manifest.json`, the background service worker in `src/background.ts` | `extension/` |
| The MCP server and its tools, starting from `src/index.ts` | `mcp-server/` |
| Code both programs use: the spec's types as zod schemas, and the conversion of Chrome's tree into the agent's tree, its revision and outline; exported from `src/index.ts` (see Shared code below) | `shared/` |
| Shared TypeScript settings, lint and format rules | `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json` |
| Repository checks that are not lint rules, with their tests | `scripts/` |
| End-to-end tests: Playwright, the built extension, and the built MCP server driven by the MCP SDK's client, with a Node WebSocket that plays the extension in `e2e/fake-extension.ts` | `e2e/` |
| The skill that organizes bookmarks, for users, and its evaluations | `skills/bookmark-organizer/`, `skills/bookmark-organizer/evals/` |
| Skills for developing this repository | `.claude/skills/<name>/SKILL.md` (other agents read them through the `.agents/skills` link) |
| Where each third-party skill came from, at which commit | `.claude/skills/THIRD_PARTY.md` |
| What changed for users, release by release | `CHANGELOG.md` |
| How to prove a change, and the map of user-facing features | `.claude/skills/verify/`, `.claude/skills/verify/features/` |
| Verification evidence files, kept on this computer and ignored by git | `artifacts/<branch>/` |
| Design decisions | `docs/adr/` |
| The domain's terms, one name each | `GLOSSARY.md` |
| The spec: the MCP tools, the plan format, the bridge protocol, backups | `docs/spec.md` |
| GitHub workflows | `.github/workflows/<verb>-<object>.yml` |

### Shared code

`shared/` is the workspace `@bookmark-organizer/shared`, which holds what the extension and the MCP server both use.
It is TypeScript source with no build of its own: `tsc`, Vitest and esbuild read `shared/src/` directly, and esbuild
bundles it into `extension/dist/background.js` and `mcp-server/dist/index.js`.

- Import it by its package name, `@bookmark-organizer/shared`, never by a relative path. `shared/src/index.ts` exports
  everything that is public.
- A type from the spec is a zod schema and the type inferred from it, under one name: `Plan.parse(input)` and
  `type Plan`. The MCP tools use the schema as their input schema.
- Its objects are strict: a field the spec does not have is refused, not dropped.
- It runs in both a service worker and Node.js, so it uses neither `chrome` nor Node's modules, only what both have,
  such as `URL` and `crypto.subtle`. Its `tsconfig.json` loads the types of a web worker and not those of `chrome` or
  Node, so `npm run typecheck` fails when it uses either.
- The workspaces list it in `devDependencies`, since it is bundled in. The MCP server's bundle leaves out its other
  `dependencies`, which load from `node_modules` (`mcp-server/build.mjs`).

## Skills and commands to use

| Before you | Use |
|---|---|
| commit, push a branch, or open or merge a pull request | [`commit-and-pull-request-convention`](.claude/skills/commit-and-pull-request-convention/SKILL.md) |
| say a change works, or write a pull request's Verification section | [`verify`](.claude/skills/verify/SKILL.md) |
| plan a feature or settle an open design decision | [`/grill-with-docs`](.claude/skills/grill-with-docs/SKILL.md), which only the developer can start; it runs `grilling` and `domain-modeling` |
| stress-test a plan without writing docs | [`grilling`](.claude/skills/grilling/SKILL.md) |
| name a domain concept, or write `GLOSSARY.md` or an ADR | [`domain-modeling`](.claude/skills/domain-modeling/SKILL.md) |
| write or change pure logic, such as plan validation, the dry run, the revision or the restore plan | [`tdd`](.claude/skills/tdd/SKILL.md), test-first, one test and its implementation at a time |
| design a module's interface or decide where a seam goes | [`codebase-design`](.claude/skills/codebase-design/SKILL.md), which `tdd` also calls for its terms |
| open a pull request | `/code-review` on the change |
| change the bridge, a network listener, or the extension's permissions | `/security-review` |
| finish a change that grew larger than planned | `/simplify` |
| debug a failing test, a broken feature or a regression | [`diagnosing-bugs`](.claude/skills/diagnosing-bugs/SKILL.md) |
| create or change a skill | `skill-creator` |
| write or edit a skill or `AGENTS.md` | [`writing-for-agents`](.claude/skills/writing-for-agents/SKILL.md), alongside `skill-creator` |
| look back on a finished issue or session and improve the agent's environment | [`/retro`](.claude/skills/retro/SKILL.md), which only the developer can start; it runs `writing-for-agents` |
| launch the extension and the bridge in isolation | [`run-bookmark-organizer`](.claude/skills/run-bookmark-organizer/SKILL.md) |

Add a row when a skill is added under `.claude/skills/`. List only skills that exist.

`tdd` writes tests only at seams confirmed with the developer. An agent working on an issue without the developer
present takes the seams listed in the issue as confirmed; an issue for pure logic lists its seams, and an agent that
needs a seam the issue does not list asks before testing there.

## Workflow

- Work on a branch from `main`, one issue per branch, and open a pull request. Pull requests are squash-merged, so the
  title becomes the commit on `main`. How to write branches, commits, the changelog and pull requests is in
  [`commit-and-pull-request-convention`](.claude/skills/commit-and-pull-request-convention/SKILL.md).
- Keep pull requests small enough to read in one sitting. Never merge code you cannot explain.
- A change to what a document in `docs/` describes updates that document in the same pull request.

## Releasing

A release publishes the MCP server to npm as `bookmark-organizer-mcp` and creates a GitHub Release with the extension
and the organizer skill as zips. The server accepts only an extension of exactly its own version, so all three come
from one tag, and users install them at the same version.

1. A release pull request, `chore: release X.Y.Z`, sets the version in the five version files and turns
   `## [Unreleased]` in `CHANGELOG.md` into `## [X.Y.Z] - YYYY-MM-DD` above a new, empty `## [Unreleased]`.
2. After it merges, the developer tags the merge commit and pushes the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
   Only the developer cuts a release; an agent never pushes a tag.
3. `.github/workflows/publish-release.yml` checks the tag against the version, runs every check, publishes to npm
   through trusted publishing (no npm token is stored), and creates the Release with the version's changelog section
   as its notes.

A version on npm can never be replaced, so a bad release is fixed by the next one. The workflow skips a version
already on npm and a Release that already exists, so a failed run can be repeated. npm accepts a trusted publisher
only for a package that exists, so the developer published the first version by hand before pushing its tag.

## Proving a change

A change is done when it is proven on the real thing, not when it compiles or its tests pass: run a build of a
commit, never the working tree, observe the result, and put the evidence in the pull request's Verification section.
What counts as proof for each kind of change, how to drive the app in isolation, and the feature map are in
[`verify`](.claude/skills/verify/SKILL.md).

## Commands

Node.js 24 (`.nvmrc`). Why the toolchain is what it is: [ADR 1](docs/adr/0001-typescript-toolchain.md).

```bash
npm install
npx playwright install chromium   # once: the browser the end-to-end tests use
npm run check            # everything CI runs, in order: the commands below
npm run format:check     # Prettier; `npm run format` fixes it
npm run lint             # ESLint with type-aware rules
npm run typecheck        # tsc in every workspace
npm test                 # Vitest
npm run check:versions   # one version in package.json, every workspace and extension/manifest.json
npm run build            # esbuild: extension/dist/ and mcp-server/dist/
npm run test:e2e         # Playwright: the built extension connects over the bridge
```

Dependencies are pinned to exact versions. The version lives in five files; change all five together.
