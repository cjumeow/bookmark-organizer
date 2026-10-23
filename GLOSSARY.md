# Bookmark Organizer

A coding agent reorganizes a person's Chrome bookmarks: it names each bookmark and files it into folders, and the
program carries the decision out exactly, reversibly and without the bookmarks leaving the computer.

## Bookmarks

**Node**:
One entry in the bookmark tree: a bookmark or a folder.
_Avoid_: item, entry

**Bookmark**:
A node that points to a site through its URL.
_Avoid_: link, favorite, site

**Site**:
The web page a bookmark points to, which the agent opens to find out what it is.
_Avoid_: page, bookmark

**Folder**:
A node that holds other nodes in order and has no URL.
_Avoid_: directory, category

**Special folder**:
A top-level folder the browser itself creates, such as the Bookmarks bar or Other bookmarks, which cannot be renamed,
moved or removed.
_Avoid_: root folder, permanent folder

**Storage**:
Where a node is kept: local storage stays on this computer, account storage is saved to the person's Google Account
and appears on their other devices. Each storage has its own special folders.
_Avoid_: sync status

**Catch-all folder**:
The one folder that holds the bookmarks that fit no other folder, instead of folders of one or two bookmarks.
_Avoid_: Other, misc folder

## Changes

**Plan**:
Every change the agent decided on, written as an ordered list of operations and applied as one whole.
_Avoid_: batch, changeset, script

**Operation**:
One change in a plan: create a node, move a node, rename a node, or remove a node.
_Avoid_: action, step, command

**Dry run**:
Checking a plan against the current bookmark tree and reporting what it would change, without changing anything.
_Avoid_: preview, simulation

**Backup**:
A copy of the whole bookmark tree, taken before a plan changes anything.
_Avoid_: snapshot, export

**Restore**:
Applying a plan that brings the bookmark tree back to a backup; nodes that were removed come back as new nodes.
_Avoid_: undo, rollback, revert

## Parts

**Agent**:
The coding agent the person talks to, which makes every judgment about names and folders.
_Avoid_: AI, model, client

**MCP server**:
The local program that gives the agent its tools and checks and records every change.
_Avoid_: backend, daemon

**Extension**:
The Chrome extension, the only part that reads and changes the bookmarks.
_Avoid_: plugin, add-on

**Bridge**:
The connection between the MCP server and the extension.
_Avoid_: socket, channel, link

**Organizer skill**:
The instructions that tell the agent how to name bookmarks and choose folders, shipped with the product.
_Avoid_: rules, prompt
