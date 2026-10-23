# Third-party skills

Skills copied into this folder from other repositories, unchanged, so their source and version are known. To update
one, copy the upstream folder again at a newer commit, read the diff before committing, and change its row here.

| Skill | Upstream | Path upstream | Commit | License | Local changes |
|---|---|---|---|---|---|
| `grill-with-docs` | [mattpocock/skills](https://github.com/mattpocock/skills) | `skills/engineering/grill-with-docs/` | [`5beb35b`](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2) | MIT | none |
| `grilling` | [mattpocock/skills](https://github.com/mattpocock/skills) | `skills/productivity/grilling/` | [`5beb35b`](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2) | MIT | none |
| `domain-modeling` | [mattpocock/skills](https://github.com/mattpocock/skills) | `skills/engineering/domain-modeling/` | [`5beb35b`](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2) | MIT | none |
| `tdd` | [mattpocock/skills](https://github.com/mattpocock/skills) | `skills/engineering/tdd/` | [`5beb35b`](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2) | MIT | none |
| `codebase-design` | [mattpocock/skills](https://github.com/mattpocock/skills) | `skills/engineering/codebase-design/` | [`5beb35b`](https://github.com/mattpocock/skills/tree/5beb35b040e3de97e54fa9e386d7e42d15c295c2) | MIT | none |

`grill-with-docs` only calls `grilling` and `domain-modeling`, so the three are installed together. `tdd` calls
`codebase-design` for the terms module, interface, seam and adapter, so the two are installed together. `tdd` also
sends refactoring to a `code-review` skill. Upstream has one, in `skills/engineering/code-review/`, but it is not
installed: Claude Code's built-in `/code-review` already does that job, and a project skill named `code-review` would
take its place.

Each folder's `agents/openai.yaml` is the upstream's display name and short description for OpenAI Codex, kept so the
copies stay identical to upstream.

Nothing checks yet that these copies stay unchanged: before committing a change under one of these folders, either
revert it or record it under Local changes.

The skills `verify` and `commit-and-pull-request-convention` are this repository's own; `verify` credits the projects
it adapts in its Source section.

## mattpocock/skills license

```text
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
