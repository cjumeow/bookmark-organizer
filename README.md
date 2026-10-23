# Bookmark Organizer

Let a coding agent such as Claude Code tidy your Chrome bookmarks: give every bookmark a short, clear name, sort them
into folders, and remove duplicates. You see every change before it happens, and every change can be undone.

https://github.com/user-attachments/assets/2b90ba8d-314c-4071-acae-ede265b3c822

## How it works

The agent judges, the program executes. The agent decides what each site is and where it belongs, following the
organizer skill. A Chrome extension and a local MCP server carry the decision out exactly, through Chrome's own
`chrome.bookmarks` API.

```text
Agent ──MCP──▶ MCP server ──WebSocket on 127.0.0.1──▶ Chrome extension ──▶ your bookmarks
```

- **You approve every change.** The agent writes the whole change as one plan and shows you a dry run first.
- **Nothing changes without a backup.** Applying a plan backs up the whole bookmark tree first, and the agent can
  restore any backup.
- **Bookmarks stay on your computer.** The server listens only on `127.0.0.1` and accepts only this extension.

## Install from source

You need Node.js 24, Chrome 134 or later, and a coding agent that speaks MCP. The steps below use
[Claude Code](https://claude.com/claude-code), the only agent it has been tested with so far.

1. Build it, in a clone you keep for using it rather than developing it:

   ```bash
   git clone https://github.com/cjumeow/bookmark-organizer.git ~/bookmark-organizer-app
   cd ~/bookmark-organizer-app && npm ci && npm run build
   ```

2. Load the extension: open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and select
   `~/bookmark-organizer-app/extension/dist`. Its ID is `ancijliidboahicggjggbhlflehlnbjg`.
3. Register the MCP server with your agent. It is a stdio server: the agent starts it with
   `node ~/bookmark-organizer-app/mcp-server/dist/index.js` and talks to it over stdin and stdout. In Claude Code:

   ```bash
   claude mcp add bookmark-organizer -s user -- node ~/bookmark-organizer-app/mcp-server/dist/index.js
   ```

   Other agents, such as Cursor (`~/.cursor/mcp.json`) or Codex (`~/.codex/config.toml`), take the same command and
   argument in their own MCP configuration; write the path out in full there, since `~` is not expanded.

4. Give your agent the organizer skill, which holds the rules for naming and filing. In Claude Code:

   ```bash
   ln -s ~/bookmark-organizer-app/skills/bookmark-organizer ~/.claude/skills/bookmark-organizer
   ```

   An agent without the skill can still use the tools, but does not know the naming rules.

5. Start a new session of your agent, so it loads the server.

## Use it

Ask in plain words, for example:

```text
Organize my bookmarks. Show me the plan first.
```

```text
Rename the bookmarks in my "Read later" folder so each one says what the site is.
```

```text
Put my bookmarks back the way they were.
```

The first request after the server starts can take up to 30 seconds while the extension connects.

## Limits

- Turn the extension on in one Chrome profile only. With several, the agent works on whichever connected first.
- It never moves a bookmark between "only on this device" and "saved in your Google Account", since that would upload
  it to Google or take it off your other devices. It tidies each group on its own.
- No changes to URLs, and no popup or other interface in the extension yet.

## Develop

Start with [`AGENTS.md`](AGENTS.md). What the tools, the plan and the bridge do is in [`docs/spec.md`](docs/spec.md),
the terms in [`GLOSSARY.md`](GLOSSARY.md), and the decisions in [`docs/adr/`](docs/adr/).
