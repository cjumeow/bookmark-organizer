// Computes the plan that brings the tree back to a backup, from the spec's "get_restore_plan" section:
// docs/spec.md#get_restore_plan.

import type { Operation, TreeNode } from "@bookmark-organizer/shared";

export interface SkippedNode {
  id: string;
  title: string;
  reason: string;
}

export interface RestorePlan {
  operations: Operation[];
  skipped: SkippedNode[];
}

// Validation refuses an empty title, which Chrome allows, as on the icon-only bookmarks of a bar.
const EMPTY_TITLE = "its title was empty, which a plan cannot set";

// A node of the copy of the current tree the plan runs on, so every index is the one chrome.bookmarks sees when that
// operation runs.
interface CopyNode {
  /** The node's ID, or the key of the create that makes it again. */
  ref: string;
  title: string;
  url?: string;
  /** Special folders only: true for account storage. */
  syncing?: boolean;
  children?: CopyNode[];
  parent?: CopyNode;
}

/** The plan that brings `currentTree` back to `backupTree`, matching nodes by ID, and the nodes it cannot restore. */
export function restorePlan(backupTree: TreeNode[], currentTree: TreeNode[]): RestorePlan {
  const operations: Operation[] = [];
  const skipped: SkippedNode[] = [];
  const nodes = new Map<string, CopyNode>();
  copy(currentTree, undefined, nodes);
  const skip = ({ id, title }: TreeNode, reason: string) => skipped.push({ id, title, reason });

  // Parents before children and children in order, so each node lands at the index it has in the backup, and what
  // was added since ends up after the restored nodes.
  const restoreChildren = (backupFolder: TreeNode[], parent: CopyNode) => {
    const children = parent.children;
    if (!children) return;
    let index = 0;
    for (const backupNode of backupFolder) {
      let node = nodes.get(backupNode.id);
      // Chrome can give an ID out again, as after an import, so a node of another kind or a bookmark with another URL
      // is another node: a plan cannot change a URL.
      if (node && ("url" in backupNode ? node.url !== backupNode.url : !node.children)) node = undefined;
      if (!node) {
        // Chrome gives the node a new ID, so the operations after this one name it by its key.
        const key = `$restore-${backupNode.id}`;
        let { title } = backupNode;
        if (isEmpty(title)) {
          title = "url" in backupNode ? backupNode.url : "Untitled folder";
          skip(backupNode, `${EMPTY_TITLE}, so it is created as ${quote(title)}`);
        }
        operations.push(
          "url" in backupNode
            ? { op: "create", key, parent: parent.ref, title, url: backupNode.url, index }
            : { op: "create", key, parent: parent.ref, title, index },
        );
        node = { ref: key, title, parent };
        if ("children" in backupNode) node.children = [];
        children.splice(index, 0, node);
        nodes.set(backupNode.id, node);
      }
      if (!node.parent?.children) continue;
      const storage = storageOf(node);
      if (storage !== storageOf(parent)) {
        const inside = "children" in backupNode ? "; nothing it held in the backup is restored either" : "";
        skip(
          backupNode,
          `it is in ${storage} storage now, and a plan may not move it back to ${storageOf(parent)} storage${inside}`,
        );
        continue;
      }
      if (node.parent !== parent || node.parent.children.indexOf(node) !== index) {
        operations.push({ op: "move", node: node.ref, parent: parent.ref, index });
        node.parent.children.splice(node.parent.children.indexOf(node), 1);
        children.splice(index, 0, node);
        node.parent = parent;
      }
      if (node.title !== backupNode.title && !isEmpty(backupNode.title)) {
        operations.push({ op: "rename", node: node.ref, title: backupNode.title });
        node.title = backupNode.title;
      } else if (node.title !== backupNode.title && !node.ref.startsWith("$")) {
        skip(backupNode, `${EMPTY_TITLE}, so it keeps ${quote(node.title)}`);
      }
      if ("children" in backupNode) restoreChildren(backupNode.children, node);
      index++;
    }
  };

  const inBackup = new Set<string>();
  const collect = (backupNodes: TreeNode[]) => {
    for (const node of backupNodes) {
      inBackup.add(node.id);
      if ("children" in node) collect(node.children);
    }
  };
  collect(backupTree);

  // Inside first, so a folder that holds only folders the restore removes is removed too.
  const removeEmptied = (folder: CopyNode) => {
    for (const child of [...(folder.children ?? [])]) {
      if (!child.children) continue;
      removeEmptied(child);
      if (child.children.length === 0 && !inBackup.has(child.ref)) {
        operations.push({ op: "remove", node: child.ref });
        folder.children?.splice(folder.children.indexOf(child), 1);
      }
    }
  };

  const specials = backupTree.flatMap((special) => {
    if (!("children" in special)) return [];
    const node = nodes.get(special.id);
    if (node) return [{ special, node }];
    const storage = special.syncing ? "account" : "local";
    for (const child of special.children) {
      skip(child, `its special folder, ${quote(special.title)} in ${storage} storage, is gone`);
    }
    return [];
  });
  for (const { special, node } of specials) restoreChildren(special.children, node);
  // Only below the special folders the backup has: nothing in the backup speaks for the others.
  for (const { node } of specials) removeEmptied(node);

  return { operations, skipped };
}

function copy(source: TreeNode[], parent: CopyNode | undefined, nodes: Map<string, CopyNode>): CopyNode[] {
  return source.map((node) => {
    const copyNode: CopyNode = { ref: node.id, title: node.title, parent };
    if ("url" in node) copyNode.url = node.url;
    else {
      copyNode.children = copy(node.children, copyNode, nodes);
      if (node.syncing !== undefined) copyNode.syncing = node.syncing;
    }
    nodes.set(node.id, copyNode);
    return copyNode;
  });
}

function storageOf(node: CopyNode): "account" | "local" {
  let special = node;
  while (special.parent) special = special.parent;
  return special.syncing ? "account" : "local";
}

function quote(text: string): string {
  return JSON.stringify(text);
}

function isEmpty(title: string): boolean {
  return title.trim() === "";
}
