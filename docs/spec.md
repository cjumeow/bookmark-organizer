# Bookmark Organizer specification

What the first version does: the MCP tools and their inputs and outputs, the plan format, the bridge protocol, and
backups. The terms are defined in [`GLOSSARY.md`](../GLOSSARY.md); the decisions behind this spec are in
[`docs/adr/`](adr/). Where this spec and the code disagree, one of them is a bug.

## Overview

The agent reads the bookmark tree with `get_tree`, decides names and folders by the organizer skill, and writes a
plan. It checks the plan with `check_plan` and shows the person the changes; only when they agree does it call
`apply_plan`, which backs up the tree and has the extension carry out the plan. `get_restore_plan` turns a backup into
a plan that brings the tree back.

```text
Agent ──MCP over stdio──▶ MCP server ──bridge: WebSocket on 127.0.0.1──▶ Extension ──chrome.bookmarks──▶ Chrome
```

- The **MCP server** validates plans, produces dry runs, writes backups and computes restore plans. It holds no
  bookmark state: every tool that needs the tree reads it fresh from the extension.
- The **extension** reads the tree and carries out operations, and nothing else. It never decides anything.
- Neither calls a language model. Neither sends anything off this computer; changes reach the person's other devices
  only through Chrome Sync, as their own edits would.

## Bookmark tree

### Nodes

The tree the agent sees keeps only what it needs to name and file bookmarks:

```ts
type TreeNode = Bookmark | Folder;

interface Bookmark {
  id: string;
  title: string;
  url: string;
}

interface Folder {
  id: string;
  title: string;
  children: TreeNode[];
  folderType?: "bookmarks-bar" | "other" | "mobile"; // special folders only
  syncing?: boolean; // special folders only: true for account storage, false for local storage
}
```

- The top level is the list of special folders. Chrome's root node is left out, since nothing can be put in it.
- A special folder is recognized by `folderType`, never by its ID or title: IDs are not fixed and titles depend on the
  language. A profile can have several special folders of one type, one per storage.
- Every node belongs to the storage of the special folder it is in.
- Folders an administrator manages (`folderType: "managed"`, or nodes marked `unmodifiable`) are left out: nothing
  can change them.
- No dates. The extension needs Chrome 134, the first version with `folderType` and `syncing`.

### Revision

A revision is a short fingerprint of the tree's structure: the first 16 hexadecimal characters of the SHA-256 of the
`id`, parent, position, `title` and `url` of every node the tree includes, in tree order. It changes when a node is
added, removed, moved, renamed or given a new URL, and not when a bookmark is merely opened. It always covers the whole
tree, even when `get_tree` returns part of it. The MCP server and the extension compute it with the same code.

A plan carries the revision of the tree it was written against, and is refused when the tree has changed since.

### Outline

Claude Code warns when one tool result passes 10,000 tokens and cuts it off at 25,000. When the JSON of the requested
tree would pass 80,000 characters (about 20,000 tokens), `get_tree` returns an outline instead: the folders without
their bookmarks, each with how many bookmarks it holds directly.

```ts
interface OutlineFolder {
  id: string;
  title: string;
  bookmarkCount: number; // bookmarks directly in this folder
  children: OutlineFolder[];
  folderType?: "bookmarks-bar" | "other" | "mobile";
  syncing?: boolean;
}
```

The agent then reads the tree one folder at a time with `get_tree`'s `folderId`.

## Plan

A plan is an ordered list of operations, applied as one whole ([ADR 3](adr/0003-plan-is-a-list-of-operations.md)).

```ts
interface Plan {
  revision: string; // from get_tree or get_restore_plan
  operations: Operation[];
}

// A node's ID ("123"), or the key of a node an earlier operation in the plan creates ("$dev-tools").
type Ref = string;

type Operation =
  | { op: "create"; key?: string; parent: Ref; title: string; url?: string; index?: number }
  | { op: "move"; node: Ref; parent: Ref; index?: number }
  | { op: "rename"; node: Ref; title: string }
  | { op: "remove"; node: Ref };
```

- **`create`** makes a bookmark when it has a `url` and a folder when it does not. The organizer skill creates only
  folders; restore plans also create bookmarks.
- **`move`** puts a node into `parent` at `index`, or last when `index` is left out.
- **`rename`** changes the title. No operation changes a URL.
- **`remove`** removes a bookmark or an empty folder. To remove a folder that has something in it, the plan first
  moves or removes what is inside, so no single operation removes a whole subtree.
- **Keys** start with `$` and contain lowercase letters, digits and hyphens. Chrome's IDs are digits, so a key never
  looks like an ID.
- **`index`** means what it means to `chrome.bookmarks` at the moment that operation runs, so the position depends on
  the operations before it.

### Validation

A plan is checked by running it on a copy of the current tree, in order, so every rule is checked against the tree as
it is at that operation. Validation reports every broken rule at once, each with the index of its operation, and a plan
with any broken rule changes nothing.

1. The plan's `revision` is the revision of the current tree.
2. Every ID is a node of the tree as `get_tree` returns it, and every key was defined by an earlier `create`. No key is
   defined twice.
3. A `parent` is a folder.
4. No operation moves, renames or removes a special folder, and nothing is created in or moved to the top level.
5. No folder is moved into itself or into a folder inside it.
6. No node is moved to another storage: moving a node between local and account storage would upload it to the
   person's Google Account or take it off their other devices, a choice the person makes in Chrome, not a side effect
   of organizing.
7. A removed folder is empty at that point.
8. Titles are not empty; a URL is an absolute URL; an `index` is between 0 and the number of children of `parent`.

A plan with no operations is valid and changes nothing.

### Dry run

`check_plan` returns what the plan would change, counted and line by line, in words a person can check:

```text
create folder "Reference" in "Other bookmarks"
move "Example: a test site" from "Bookmarks bar/Misc" to "Other bookmarks/Reference"
rename "example.org" to "Example Org: another test site"
remove "Example: a test site" from "Bookmarks bar/Old"
```

Folders are written as paths from their special folder. When the profile has both storages, a special folder's name
says which, as in `"Bookmarks bar (account)"`.

## MCP tools

| Tool | Changes bookmarks | Input | Output |
|---|---|---|---|
| `get_tree` | no | `{ folderId?: string }` | `{ revision, tree: TreeNode[] }` or `{ revision, outline: OutlineFolder[] }` |
| `check_plan` | no | `Plan` | `{ valid: true, summary, changes }` or `{ valid: false, errors }` |
| `apply_plan` | yes | `Plan` | `{ backupId, applied, created, revision, failed? }` |
| `list_backups` | no | `{}` | `{ backups }` |
| `get_restore_plan` | no | `{ backupId: string }` | `{ plan, skipped }` |

`apply_plan` is the only tool that changes bookmarks, so a person can allow the other four once and still be asked
before every change ([ADR 4](adr/0004-only-apply-plan-changes-bookmarks.md)). The four are marked `readOnlyHint` and
`apply_plan` is marked `destructiveHint`. Every tool's input is a zod schema, which the SDK turns into the JSON Schema
the agent sees and which checks the input when the tool is called.

### `get_tree`

Reads the whole tree, or with `folderId` only that folder and what is inside it, and returns it with the revision of
the whole tree. When the result would be too large it returns an outline instead (see [Outline](#outline)).

### `check_plan`

Validates a plan and returns its dry run. Nothing changes.

```ts
type CheckResult =
  | {
      valid: true;
      summary: { foldersCreated: number; bookmarksCreated: number; moved: number; renamed: number; removed: number };
      changes: string[]; // one line per operation, as in the dry run above
    }
  | { valid: false; errors: { operation: number; message: string }[] };
```

### `apply_plan`

1. Reads the current tree and validates the plan as `check_plan` does. An invalid plan returns the same `errors` and
   changes nothing.
2. Writes a backup of the whole tree. When the backup cannot be written, it stops; nothing has changed.
3. Sends the operations to the extension, which compares the revision again just before it starts, to narrow the gap
   in which the person could change the tree.
4. The extension runs the operations in order and stops at the first one that fails. Chrome has no transactions, so
   the operations before it stay applied; nothing rolls them back, since a rollback could fail too. The agent tells the
   person and offers to restore the backup.

```ts
interface ApplyResult {
  backupId: string;
  applied: number; // how many operations ran, from the first
  created: Record<string, string>; // key → the ID Chrome gave the node
  revision: string; // of the tree afterwards
  failed?: { operation: number; message: string };
}
```

### `list_backups`

Lists the backups, newest first.

```ts
interface BackupSummary {
  id: string; // "2026-10-23T14-05-00Z"
  createdAt: string; // ISO 8601
  bookmarks: number;
  folders: number;
  operations: number; // in the plan applied after the backup was taken
}
```

### `get_restore_plan`

Computes the plan that brings the current tree back to a backup, with the current tree's revision. Nothing changes:
the agent passes the plan to `check_plan` and `apply_plan` like any other, so a restore is checked first, backs up the
tree first, and can itself be restored.

The plan matches nodes by ID. Walking the backup from each special folder down, parents before children and children
in order:

- A node that still exists is moved back to its folder and position, and renamed back, where it differs.
- A node that no longer exists is created again, with the key `$restore-<its old ID>`. Chrome gives it a new ID and
  today's date; that cannot be avoided, because Chrome does not let an extension choose either.
- A bookmark added after the backup stays in its folder, after the restored nodes.
- A folder that is not in the backup is removed when the restore leaves it empty, and kept otherwise.

`skipped` lists the nodes the plan cannot restore, each with its ID, title and reason: a node whose special folder no
longer exists, or one that is now in the other storage, which a plan may not move it out of.

### Server instructions

When the agent connects, the server sends these instructions, which the agent sees beside its tools:

> Bookmark Organizer reads and changes the person's Chrome bookmarks. Decide names and folders by the
> bookmark-organizer skill. Run check_plan and show the person its changes before apply_plan, and apply only after
> they agree.

The rules for naming and filing live only in the organizer skill, in `skills/bookmark-organizer/`. They are not served
as an MCP prompt: in Claude Code a prompt is a slash command the person types, while the agent loads a skill on its own
when the task calls for it.

### Errors

A tool that cannot do its work returns an MCP error result (`isError: true`) whose text says what to do:

| Situation | The error says |
|---|---|
| The extension does not connect within 40 seconds | Chrome is not reachable: open Chrome with the Bookmark Organizer extension turned on. |
| Another Claude Code session holds the bridge's port | Another session is using the bridge; finish there or close it. |
| The extension's version differs from the server's | Update the extension (version X) to match the server (version Y). |
| The tree changed since the plan's revision | The bookmarks changed; call `get_tree` again and rewrite the plan. |
| No answer from the extension within 60 seconds | The extension did not answer; for `apply_plan`, some operations may have run, and the backup ID is given. |
| An unknown `backupId` or `folderId` | That backup (or folder) does not exist. |

## Bridge

The bridge is a WebSocket on `127.0.0.1` ([ADR 2](adr/0002-websocket-bridge.md)).

### Connecting

- **Port:** `47615`, a constant in both programs.
- **The server listens only while it needs Chrome.** Every Claude Code session that has the server registered starts
  its own copy, and only one can listen on the port. A tool that needs the tree (all but `list_backups`) opens the
  listener, and the server closes it after 10 minutes without a tool call. When the port is already taken, the tool
  fails with the error above.
- **The extension connects.** It tries when Chrome starts, when it is installed, and on a `chrome.alarms` alarm every
  30 seconds while it is not connected, which also wakes its service worker. So the first tool call after the listener
  opens can wait up to about 30 seconds; the server waits up to 40.
- **Who may connect:** the server accepts the WebSocket upgrade only when the `Origin` header is
  `chrome-extension://<the extension's ID>` and the `Host` header is `127.0.0.1:47615`, and refuses it with HTTP 403
  otherwise. The extension's ID is fixed by the `key` in `manifest.json`. There is no token.
- **One extension at a time.** While one extension is connected, a second connection is closed with code `4001`. With
  the extension in several Chrome profiles, the agent works on whichever connected first.
- **Keepalive:** while connected, the extension sends a keepalive every 20 seconds, which keeps its service worker
  running.

### Messages

Every message is one JSON object. Requests and responses are matched by `id`, which the sender chooses:

```ts
type Request = { id: number; method: string; params?: unknown };
type Response = { id: number; result: unknown } | { id: number; error: { code: string; message: string } };
type Notification = { method: string; params?: unknown }; // no id, no answer
```

| Message | Sent by | Params | Result |
|---|---|---|---|
| `hello` request | extension, first | `{ version: string }` | `{ version: string }` |
| `keepalive` notification | extension, every 20 s | — | — |
| `getTree` request | server | — | `{ tree: ChromeNode[] }` |
| `applyOperations` request | server | `{ revision: string; operations: Operation[] }` | `{ applied, created, revision, failed? }` |

- **`hello`:** the server answers only when the versions are equal (one version is written in all five version files)
  and otherwise closes the connection with code `4002`, so tools report the mismatch.
- **`getTree`** returns Chrome's whole tree, below the root, as nodes with `id`, `title`, `url`, `children`,
  `folderType`, `syncing` and `unmodifiable`. The server drops managed nodes and computes the revision, `get_tree`'s
  `folderId` and the outline.
- **`applyOperations`** carries a plan the server has validated. The extension computes the revision again and answers
  with the error code `revision-mismatch` when it differs, having changed nothing. Otherwise it runs the operations in
  order, replacing each key with the ID Chrome gave it, and stops at the first that fails.
- A request has 60 seconds to be answered.

## Backups

- **Where:** JSON files in a per-user data folder, written by the MCP server: on macOS
  `~/Library/Application Support/bookmark-organizer/backups/`, on Linux `$XDG_DATA_HOME/bookmark-organizer/backups/`
  (`~/.local/share/` when it is unset), on Windows `%APPDATA%\bookmark-organizer\backups\`. The environment variable
  `BOOKMARK_ORGANIZER_DATA_DIR` replaces the data folder, for tests. They are not in `chrome.storage`, which is erased
  when the extension is removed, and which neither the person nor the agent can read without the extension.
- **Who may read them:** the folder is created with mode `0700` and each file with `0600`. A backup holds every URL,
  as Chrome's own bookmarks file does.
- **Name:** a backup's ID is its file name without `.json`, the time it was taken in UTC, as in
  `2026-10-23T14-05-00Z`; a second backup in the same second gets `-2`.
- **Content:**

  ```ts
  interface BackupFile {
    formatVersion: 1;
    id: string;
    createdAt: string; // ISO 8601
    version: string; // Bookmark Organizer's version
    revision: string; // of the tree at the time
    tree: TreeNode[]; // the whole tree, as get_tree returns it
    plan: Plan; // the plan applied after the backup was taken
  }
  ```

- **How long:** every backup is kept. Nothing deletes one automatically; the person deletes the files when they want
  to.

## Extension

- Manifest V3, with the `bookmarks` and `alarms` permissions, a module service worker, a `key`, and
  `"minimum_chrome_version": "134"`.
- No popup and no other page: the first version is the service worker alone.

## Not in the first version

- A popup or any other interface in the extension.
- Publishing the extension in the Chrome Web Store, or the MCP server on npm.
- Shipping the MCP server and the organizer skill together as one Claude Code plugin.
- An operation that changes a URL.
- Moving nodes between local and account storage.
- Browsers other than Chrome.
- Choosing which Chrome profile to work on when the extension is installed in several.
