---
tags: [skill-creator]
max_turns: 60
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

(Test environment: Chrome and the Bookmark Organizer MCP server are simulated in this folder, and so is the web.
Call a tool with `node simulate-tools.mjs <tool> [argument]` and treat what it prints as the tool's result:
`get_tree [folderId]`, `check_plan <plan-file.json>`, `apply_plan <plan-file.json>`, `list_backups`,
`get_restore_plan <backupId>`. Run `node simulate-tools.mjs help` first for the tools' descriptions, as an MCP client
would show them. Open a site with `node simulate-tools.mjs open <url>`; nothing else reaches the internet. Do not read
fixture.json, state.json or tool-calls.log: they are the inside of the simulation. The person cannot reply during this
test: where you would wait for their answer, end with the message you would send them.)

我的書籤很亂，可以幫我整理一下嗎？幫每個書籤取個看得懂的名字，然後分到合適的資料夾。

Input files: fixture.json, simulate-tools.mjs
