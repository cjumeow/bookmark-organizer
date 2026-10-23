// The revision, a short fingerprint of the bookmark tree's structure: docs/spec.md#revision.

import type { TreeNode } from "./tree.js";

/**
 * The first 16 hexadecimal characters of the SHA-256 of every node's ID, parent's ID, position, title and URL, in tree
 * order. The hashed string is the JSON of one array per node, `[id, parentId, index, title, url]`, with `null` for the
 * parent of a special folder and the URL of a folder.
 */
export async function revisionOf(tree: TreeNode[]): Promise<string> {
  const entries: [string, string | null, number, string, string | null][] = [];
  const walk = (nodes: TreeNode[], parentId: string | null): void => {
    nodes.forEach((node, index) => {
      if ("url" in node) {
        entries.push([node.id, parentId, index, node.title, node.url]);
      } else {
        entries.push([node.id, parentId, index, node.title, null]);
        walk(node.children, node.id);
      }
    });
  };
  walk(tree, null);

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(entries)));
  return Array.from(new Uint8Array(digest, 0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
