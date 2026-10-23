// Chrome's bookmark tree as the extension's `getTree` returns it, and its conversion into the tree the agent sees:
// docs/spec.md#nodes and #messages.

import { z } from "zod";

import type { Folder, TreeNode } from "./tree.js";

/**
 * A node of Chrome's tree, as `chrome.bookmarks.getTree()` returns it below the root.
 *
 * Unlike the spec's other objects it is not strict: Chrome's nodes also have dates, `index` and `parentId`, which are
 * dropped rather than refused, so the extension can send them as Chrome gives them.
 */
export const ChromeNode = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  get children(): z.ZodOptional<z.ZodArray<typeof ChromeNode>> {
    return z.array(ChromeNode).optional();
  },
  folderType: z.enum(["bookmarks-bar", "other", "mobile", "managed"]).optional(),
  syncing: z.boolean(),
  unmodifiable: z.literal("managed").optional(),
});
export type ChromeNode = z.infer<typeof ChromeNode>;

/**
 * Converts the nodes below Chrome's root into the tree the agent sees. Throws when they are not Chrome nodes, or when
 * one of them is not a special folder, as when Chrome's root itself is passed.
 */
export function toTree(chromeNodes: unknown): TreeNode[] {
  // Every node below the root is a special folder: only they keep folderType and syncing.
  return z
    .array(ChromeNode)
    .parse(chromeNodes)
    .filter(isChangeable)
    .map((node) => {
      if (node.folderType === undefined) {
        throw new Error(`Node ${node.id} is at the top level but is not a special folder.`);
      }
      return { ...convertFolder(node), folderType: node.folderType, syncing: node.syncing };
    });
}

/** Managed folders and unmodifiable nodes are left out: nothing can change them. */
function isChangeable(
  node: ChromeNode,
): node is ChromeNode & { folderType?: Exclude<ChromeNode["folderType"], "managed"> } {
  return node.folderType !== "managed" && node.unmodifiable === undefined;
}

function convertChildren(nodes: ChromeNode[] = []): TreeNode[] {
  return nodes
    .filter(isChangeable)
    .map((node) => (node.url === undefined ? convertFolder(node) : { id: node.id, title: node.title, url: node.url }));
}

function convertFolder(node: ChromeNode): Folder {
  return { id: node.id, title: node.title, children: convertChildren(node.children) };
}
