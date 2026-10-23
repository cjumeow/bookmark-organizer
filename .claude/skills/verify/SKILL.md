---
name: verify
description: How to prove that a change to bookmark-organizer works before calling it done, covering what counts as evidence for each kind of change, how sure a claim is, how to drive the app and observe the result in isolation, the feature map of what to drive, and where the evidence goes. Use before saying a change works or is done, before writing the Verification section of a pull request, when reviewing whether a change is proven, and when adding or changing a user-facing feature. Replaces Claude Code's bundled /verify in this repository.
---

# Verify a change

An agent saying "done" is a claim, and so is "the tests pass": it says something about the tests, not about the
feature. A change is proven when someone observed the real thing working and left evidence the developer can check or
re-run. That evidence is what the developer reads before merging, so it decides whether a pull request can be trusted
without redoing the work.

## What counts as proof

- **Check the real artifact, not a proxy.** Run the feature, read the actual value, inspect the actual state. "It
  compiles", a green test that does not cover the change, and your own summary of what the code does are not proof.
- **Observe through a different path than the code under test.** If `apply_plan` is wrong, `get_tree` may be wrong
  the same way, because both cross the same bridge. Read the result directly with `chrome.bookmarks` in the
  extension's service worker instead.
- **Quote what happened, whole.** Output cut with `| tail` or `| head`, and text you echoed yourself, prove nothing.
  Read exit codes. When a check fails, suspect the way you observed before you suspect the system.
- **A red check proves something only when it fails for the reason you predicted.** An exception, an empty result and
  a real mismatch all fail. Quote the difference the assertion printed, not the assertion.
- **Script the check when you can.** A script the developer can run again beats a description of what you saw. Keep
  it in the pull request when the check is worth repeating, and turn it into a test when it protects behavior that can
  break again.
- **Say what is still unproven.** An honest "not checked: restoring a tree of several thousand bookmarks" is part of
  the proof.

### How sure is a claim

Name the level each claim reached. The main claim of a `feat` or a `fix` reaches level 4 or 5.

| Level | The claim rests on |
|---|---|
| 1 | You said so. Worth nothing on its own. |
| 2 | You pointed at the line (`file:line`, or the library's own source). |
| 3 | You walked the failure step by step and showed it cannot happen. |
| 4 | You ran it: a script or test calls the real code and fails loudly if you are wrong. |
| 5 | You reproduced it in the running app. |

## Evidence by kind of change

| Change | Proof | Not proof |
|---|---|---|
| Pure logic (plan validation, dry run, tree conversion) | A test that failed before the change with the predicted difference, and passes after | "All tests pass" when no test covers the change |
| An MCP tool | A real MCP client calling the built server: the request and the response | Reading the handler and saying what it would return |
| The bridge | A real connection from the built extension, and a connection with a wrong `Origin` that is refused | "The code checks the Origin" |
| What the extension does to bookmarks | The tree before and after, read with `chrome.bookmarks` in an isolated browser, and a screenshot of `chrome://bookmarks` | The tree as `get_tree` reports it |
| The product skill in `skills/bookmark-organizer/` | A `/skill-creator` comparison with and without the skill on made-up bookmarks | "The rule is clearly written" |
| A CI workflow | A link to its run, and a deliberately broken case that makes it fail | "The YAML is valid" |
| Docs or a development skill | A read-through against what it describes; check every command, path and link it names | — |

## Driving the app

Drive the app the way its users do, through the surface they touch, and observe the result outside the code you
changed.

| Surface | Drive it with | Observe |
|---|---|---|
| MCP server | An MCP client: the MCP Inspector's CLI mode (`--cli`), run from the version pinned in the repository's dev dependencies rather than a bare `npx`, which runs whatever release is latest; or a short script using the SDK's client | The tool's response |
| Chrome extension | Playwright's bundled Chromium with the built extension loaded and its own temporary profile | `chrome.bookmarks.getTree()` evaluated in the extension's service worker; a screenshot of `chrome://bookmarks` |
| The whole flow | Calling the MCP tools in order, as the agent would | Both of the above |

Rules that keep a run safe and its evidence trustworthy:

- **Isolate.** Never drive the developer's own Chrome, profile or real bookmarks, and never use Claude in Chrome for
  verification: it acts in the developer's real browser. Use a temporary profile seeded with made-up bookmarks on
  `example.com`.
- **Run a build of a commit**, never the working tree, so a half-edited file never runs and the result traces to a
  commit.
- **Kill only what you started**, never by process name.
- **Cleanup keeps the evidence.** Tear down browsers, servers and temporary profiles; keep the artifacts.

### The launch recipe

[`run-bookmark-organizer`](../run-bookmark-organizer/SKILL.md) launches the built extension in Playwright's Chromium
with a temporary profile and drives the built MCP server with the SDK's client: `npm run build && npm run test:e2e`, from a clean checkout of the
commit to prove.

- **Ready** when the `serviceWorker` fixture resolves at `chrome-extension://ancijliidboahicggjggbhlflehlnbjg/` and
  the `mcp` fixture's first tool call that needs Chrome returns, about 30 seconds later, on the extension's next
  alarm.
- **Teardown** is in the fixtures: the browser closes, the temporary profile is deleted and the MCP client closes,
  which ends the server and frees port 47615, even when a test fails. The evidence stays in `artifacts/e2e/`.

Update the recipe when building or launching changes.

## Feature map

[`features/`](features/README.md) lists every user-facing feature: how a user reaches it, how to drive it, and what
observable end state proves it works. Its format is in [`references/feature-map-format.md`](references/feature-map-format.md).

- A pull request that adds or changes a user-facing feature adds or updates its file in the same pull request.
- A proof covers every entry point the map lists for the feature, not only the most convenient one.
- When the seed data lacks what a journey needs, the journey fails and the reason goes in the feature's `Gotchas`.
  Never weaken a journey to make it pass.

## Where the evidence goes

- **The pull request's `## Verification` section:** each claim, the level it reached, and its evidence (the command
  and the relevant output, or the artifact's path), then what is still unproven. The section format is in
  [`commit-and-pull-request-convention`](../commit-and-pull-request-convention/SKILL.md).
- **Files** such as screenshots and tree dumps go in `artifacts/<branch>/`, which git ignores, so they exist only on
  this computer. The pull request must stand on its own: paste the text evidence, and say what each file shows. Never
  paste the developer's real bookmarks anywhere.

## Claude Code's built-in tools

| Tool | What it does here |
|---|---|
| `/verify` | Claude Code's bundled verification, which only the developer can start. This skill replaces it in this repository: a project skill with a bundled skill's name takes its place. |
| `/run` | Launches and drives the app to see a change working, using a recorded `run-*` skill when one exists. |
| `/run-skill-generator` | Gets the app running from a clean environment and records the recipe as `.claude/skills/run-<name>/`. Run it once when the app first runs, and again when building or launching changes. |
| `/code-review` | Reviews the code. It is judgment, not proof of behavior, so it does not replace the evidence above. |

## Source

Adapted from Lauren Tan's [pstack](https://github.com/cursor/plugins/tree/main/pstack) (MIT): the
`principle-prove-it-works`, `create-verification-skill` and `blast-radius` skills, and from its Claude Code port
[pstack-claude](https://github.com/michael-denyer/pstack-claude) by Michael Denyer (MIT).
