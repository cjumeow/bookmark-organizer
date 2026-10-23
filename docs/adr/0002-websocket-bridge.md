# The bridge is a localhost WebSocket, not Native Messaging

Date: 2026-10-23. Status: accepted.

The MCP server, a Node.js process that Claude Code starts, listens for a WebSocket on `127.0.0.1`, and the extension's
service worker connects to it. The server accepts a connection only when its `Origin` is the extension's own
`chrome-extension://<id>`, and the extension's ID is fixed by the `key` in `manifest.json`, so it is the same in every
checkout and every install.

## Considered options

- **Chrome Native Messaging,** usually thought the more locked-down option, was rejected because it does not remove
  the local connection, it adds to it. Chrome starts the native host itself, so it is a different process from the
  MCP server Claude Code starts, and the two would still need a socket or pipe between them: three processes and two
  connections instead of two and one. It also needs a host manifest installed in Chrome's folder (in the registry on
  Windows), with the extension ID written out, for each browser the person uses.
- The `Origin` check is enough against web pages, which cannot set that header. Only a local program can forge it,
  and a local program running as the person can already read Chrome's bookmarks file, so the WebSocket opens no new
  way in. For the same reason there is no shared token: it would add a pairing step and protect against nothing the
  `Origin` check leaves open.

## Consequences

- Every Claude Code session that has the MCP server registered starts its own copy, and only one process can listen
  on a port. So the server listens on its fixed port only while a tool needs Chrome and closes it after 10 idle
  minutes, and a tool called while another session holds the port fails with an error that says so.
- A sleeping service worker can only be woken by `chrome.alarms`, at most every 30 seconds, so the first tool call
  after the bridge opens can wait up to about 30 seconds for the extension to connect.

- An extension service worker stops after 30 seconds without events; WebSocket messages keep it alive since Chrome
  116, so the extension sends a keepalive while connected. (The manifest asks for Chrome 134, for other reasons; see
  the spec.)
- If the threat changes, for example if a forged `Origin` from a local program starts to matter, Native Messaging is
  the fallback.
