// What `get_tree` returns: the whole tree or one folder, as a tree or an outline: docs/spec.md#get_tree and #outline.

import { revisionOf } from "./revision.js";
import type { Folder, OutlineFolder, TreeNode } from "./tree.js";

export class UnknownFolderError extends Error {
  constructor(readonly folderId: string) {
    super(`Folder ${folderId} does not exist.`);
    this.name = "UnknownFolderError";
  }
}

export type TreeSelection = { revision: string; tree: TreeNode[] } | { revision: string; outline: OutlineFolder[] };

/** About 20,000 tokens, below the 25,000 at which Claude Code cuts a tool result off. */
const maxTreeLength = 80_000;

/**
 * The whole tree, or with `folderId` that folder and what is inside it, as an outline when its JSON would pass 80,000
 * characters. The revision always covers the whole tree. Throws `UnknownFolderError` when `folderId` names no folder.
 */
export async function selectTree(tree: TreeNode[], folderId?: string): Promise<TreeSelection> {
  const revision = await revisionOf(tree);
  let selected = tree;
  if (folderId !== undefined) {
    const folder = findFolder(tree, folderId);
    if (folder === undefined) throw new UnknownFolderError(folderId);
    selected = [folder];
  }
  if (JSON.stringify(selected).length <= maxTreeLength) return { revision, tree: selected };
  return { revision, outline: selected.filter((node) => "children" in node).map(outlineOf) };
}

function outlineOf(folder: Folder): OutlineFolder {
  const outline: OutlineFolder = {
    id: folder.id,
    title: folder.title,
    bookmarkCount: folder.children.filter((node) => "url" in node).length,
    children: folder.children.filter((node) => "children" in node).map(outlineOf),
  };
  if (folder.folderType !== undefined) outline.folderType = folder.folderType;
  if (folder.syncing !== undefined) outline.syncing = folder.syncing;
  return outline;
}

function findFolder(nodes: TreeNode[], folderId: string): Folder | undefined {
  for (const node of nodes) {
    if (!("children" in node)) continue;
    if (node.id === folderId) return node;
    const found = findFolder(node.children, folderId);
    if (found !== undefined) return found;
  }
  return undefined;
}
