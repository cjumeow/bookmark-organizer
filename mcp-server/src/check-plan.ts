// Validates a plan and describes its dry run, from the spec's "Validation" and "Dry run" sections:
// docs/spec.md#validation and #dry-run.

import type { Plan, TreeNode } from "@bookmark-organizer/shared";

export interface Summary {
  foldersCreated: number;
  bookmarksCreated: number;
  moved: number;
  renamed: number;
  removed: number;
}

export interface PlanError {
  operation: number;
  message: string;
}

export type CheckResult = { valid: true; summary: Summary; changes: string[] } | { valid: false; errors: PlanError[] };

/** An error that belongs to the whole plan rather than to one operation, such as a stale revision. */
export const WHOLE_PLAN = -1;

/** What a plan written against an older tree is told, as the error of the whole plan. */
export const STALE_PLAN = "The bookmarks changed; call get_tree again and rewrite the plan.";

// Chrome's IDs are digits, so a key never looks like one.
const KEY = /^\$[a-z0-9-]+$/;

// A node of the copy the plan runs on, linked to its parent so a folder's path can be written.
interface CopyNode {
  title: string;
  url?: string;
  /** Special folders only: true for account storage. */
  syncing?: boolean;
  /** Special folders only: the name that starts a path, which says the storage when the tree has both. */
  pathName?: string;
  children?: CopyNode[];
  parent?: CopyNode;
}

export function checkPlan(tree: TreeNode[], currentRevision: string, plan: Plan): CheckResult {
  const errors: PlanError[] = [];
  if (plan.revision !== currentRevision) {
    errors.push({ operation: WHOLE_PLAN, message: STALE_PLAN });
  }

  const nodes = new Map<string, CopyNode>();
  const specials = copy(tree, undefined, nodes);
  const bothStorages = new Set(specials.map((special) => special.syncing === true)).size > 1;
  for (const special of specials) {
    special.pathName = bothStorages ? `${special.title} (${storageOf(special)})` : special.title;
  }
  const summary: Summary = { foldersCreated: 0, bookmarksCreated: 0, moved: 0, renamed: 0, removed: 0 };
  const changes: string[] = [];
  const keyDefinedBy = new Map<string, number>();
  const removedBy = new Map<string, number>();

  for (const [i, operation] of plan.operations.entries()) {
    const report = (message: string) => errors.push({ operation: i, message });
    const resolve = (ref: string, role: "node" | "parent"): CopyNode | undefined => {
      const node = nodes.get(ref);
      const removed = removedBy.get(ref);
      if (removed !== undefined) {
        report(`${role} ${quote(ref)} was removed by operation ${String(removed)}`);
      } else if (!node && keyDefinedBy.has(ref)) {
        report(
          `${role} ${quote(ref)} names nothing: operation ${String(keyDefinedBy.get(ref))}, which creates it, is invalid`,
        );
      } else if (!node) {
        const missing = ref.startsWith("$") ? "a key defined by an earlier create" : "in the bookmark tree";
        report(`${role} ${quote(ref)} is not ${missing}`);
      }
      return node;
    };
    // Special folders are the only nodes at the top level, so they are the ones without a parent.
    const resolveNode = (ref: string, verb: "moved" | "renamed" | "removed"): CopyNode | undefined => {
      const node = resolve(ref, "node");
      if (!node?.parent) {
        if (node) report(`node ${quote(ref)} is a special folder, which cannot be ${verb}`);
        return undefined;
      }
      return node;
    };
    // Checked before a moving node leaves its folder, as chrome.bookmarks checks it, so a node that moves within its
    // own folder counts among the children.
    const checkIndex = (index: number | undefined, parent: CopyNode) => {
      const count = parent.children?.length ?? 0;
      if (index !== undefined && (index < 0 || index > count)) {
        report(
          `index ${String(index)} is outside ${quote(pathOf(parent))}, which holds ${String(count)} ${count === 1 ? "node" : "nodes"}: ` +
            `use 0 to ${String(count)}`,
        );
      }
    };
    const resolveParent = (ref: string): CopyNode | undefined => {
      const parent = resolve(ref, "parent");
      if (!parent || parent.children) return parent;
      report(`parent ${quote(ref)} is a bookmark, not a folder`);
      return undefined;
    };

    if (operation.op === "create") {
      const before = errors.length;
      const parent = resolveParent(operation.parent);
      const { key } = operation;
      if (key !== undefined && !KEY.test(key)) {
        report(`key ${quote(key)} is not "$" followed by lowercase letters, digits and hyphens`);
      } else if (key !== undefined) {
        const definedBy = keyDefinedBy.get(key);
        if (definedBy === undefined) keyDefinedBy.set(key, i);
        else report(`key ${quote(key)} is already defined by operation ${String(definedBy)}`);
      }
      if (isEmpty(operation.title)) report("the title is empty");
      if (operation.url !== undefined && !URL.canParse(operation.url)) {
        report(`the URL ${quote(operation.url)} is not an absolute URL`);
      }
      if (parent) checkIndex(operation.index, parent);
      if (!parent?.children || errors.length > before) continue;
      const isBookmark = operation.url !== undefined;
      const node: CopyNode = isBookmark
        ? { title: operation.title, url: operation.url, parent }
        : { title: operation.title, children: [], parent };
      parent.children.splice(operation.index ?? parent.children.length, 0, node);
      // Keys start with "$" and Chrome's IDs are digits, so one map holds both.
      if (key !== undefined) nodes.set(key, node);
      changes.push(
        `create ${isBookmark ? "bookmark" : "folder"} ${quote(operation.title)} in ${quote(pathOf(parent))}` +
          landing(node, operation.index),
      );
      if (isBookmark) summary.bookmarksCreated++;
      else summary.foldersCreated++;
    } else if (operation.op === "move") {
      const node = resolveNode(operation.node, "moved");
      const parent = resolveParent(operation.parent);
      if (!node?.parent?.children || !parent?.children) continue;
      if (isInside(parent, node)) {
        report(`folder ${quote(operation.node)} cannot move into itself or a folder inside it`);
        continue;
      }
      const fromStorage = storageOf(node);
      const toStorage = storageOf(parent);
      if (fromStorage !== toStorage) {
        report(`node ${quote(operation.node)} would move from ${fromStorage} storage to ${toStorage} storage`);
        continue;
      }
      const before = errors.length;
      checkIndex(operation.index, parent);
      if (errors.length > before) continue;
      const from = node.parent;
      const oldIndex = node.parent.children.indexOf(node);
      node.parent.children.splice(oldIndex, 1);
      // As chrome.bookmarks.move does, a node moving later in its own folder counts its old place in the index, so it
      // lands just before the node that was at that index.
      let index = operation.index ?? parent.children.length;
      if (from === parent && index > oldIndex) index--;
      parent.children.splice(index, 0, node);
      node.parent = parent;
      changes.push(
        `move ${quote(node.title)} from ${quote(pathOf(from))} to ${quote(pathOf(parent))}` +
          landing(node, operation.index),
      );
      summary.moved++;
    } else if (operation.op === "rename") {
      const node = resolveNode(operation.node, "renamed");
      if (isEmpty(operation.title)) report("the title is empty");
      if (!node || isEmpty(operation.title)) continue;
      changes.push(`rename ${quote(node.title)} to ${quote(operation.title)}`);
      node.title = operation.title;
      summary.renamed++;
    } else {
      const node = resolveNode(operation.node, "removed");
      if (!node?.parent?.children) continue;
      if (node.children?.length) {
        report(`folder ${quote(operation.node)} is not empty: move or remove what is inside it first`);
        continue;
      }
      const from = node.parent;
      node.parent.children.splice(node.parent.children.indexOf(node), 1);
      nodes.delete(operation.node);
      removedBy.set(operation.node, i);
      changes.push(`remove ${quote(node.title)} from ${quote(pathOf(from))}`);
      summary.removed++;
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, summary, changes };
}

function copy(source: TreeNode[], parent: CopyNode | undefined, nodes: Map<string, CopyNode>): CopyNode[] {
  return source.map((node) => {
    const copyNode: CopyNode = { title: node.title, parent };
    if ("url" in node) copyNode.url = node.url;
    else {
      copyNode.children = copy(node.children, copyNode, nodes);
      if (node.syncing !== undefined) copyNode.syncing = node.syncing;
    }
    nodes.set(node.id, copyNode);
    return copyNode;
  });
}

/** Where a node placed at an index landed, for its dry-run line; nothing when the operation has no index. */
function landing(node: CopyNode, index: number | undefined): string {
  if (index === undefined || !node.parent?.children) return "";
  const siblings = node.parent.children;
  const next = siblings[siblings.indexOf(node) + 1];
  return next ? `, before ${quote(next.title)}` : ", at the end";
}

function isEmpty(title: string): boolean {
  return title.trim() === "";
}

/** Whether `node` is `ancestor` or somewhere inside it. */
function isInside(node: CopyNode, ancestor: CopyNode): boolean {
  for (let current: CopyNode | undefined = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

function storageOf(node: CopyNode): "account" | "local" {
  let special = node;
  while (special.parent) special = special.parent;
  return special.syncing ? "account" : "local";
}

function pathOf(folder: CopyNode): string {
  return folder.parent ? `${pathOf(folder.parent)}/${folder.title}` : (folder.pathName ?? folder.title);
}

function quote(text: string): string {
  return JSON.stringify(text);
}
