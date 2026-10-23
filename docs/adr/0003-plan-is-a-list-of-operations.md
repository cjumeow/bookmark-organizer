# A plan is a list of operations, not a target tree

Date: 2026-10-23. Status: accepted.

The agent writes a plan as an ordered list of operations (create a folder, move a node, rename a node, remove a node),
with new folders referred to by temporary keys until they have real IDs. It does not write the bookmark tree it wants
and leave the MCP server to work out the difference.

## Considered options

- **A target tree** is the more natural thing for the agent to describe, and was rejected for two reasons. The agent
  would write out the whole tree, about as many tokens as reading it, and output tokens are the slowest and most
  expensive part of a run. And the server would have to infer from two trees whether a node was moved or removed and
  recreated; inferring wrong loses a bookmark.
- A list of operations carries only what changes, each operation can be checked on its own, and a dry run is a summary
  of the list. The cost is that the agent has to handle positions and temporary keys.
