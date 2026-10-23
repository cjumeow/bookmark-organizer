// Carries out a validated plan's operations with chrome.bookmarks, from the spec's `applyOperations` message:
// docs/spec.md#messages and #apply_plan.

import { type ApplyOperationsResult, ErrorCode, type Operation, revisionOf, toTree } from "@bookmark-organizer/shared";

import { RequestError } from "./bridge.js";

/** The part of `chrome.bookmarks` the applier uses, passed in so tests can fake it. */
export interface Bookmarks {
  getTree(): Promise<{ children?: unknown[] }[]>;
  create(bookmark: { parentId: string; title: string; url?: string; index?: number }): Promise<{ id: string }>;
  move(id: string, destination: { parentId: string; index?: number }): Promise<unknown>;
  update(id: string, changes: { title: string }): Promise<unknown>;
  remove(id: string): Promise<unknown>;
}

/** The plan being applied, which the next one waits for. */
let applying: Promise<unknown> = Promise.resolve();

/**
 * Applies one plan's operations, after any plan still being applied, so the revision check of the second sees what the
 * first changed instead of both passing it before either changes anything.
 */
export function applyOperations(
  bookmarks: Bookmarks,
  revision: string,
  operations: Operation[],
): Promise<ApplyOperationsResult> {
  const run = applying.then(() => applyNow(bookmarks, revision, operations));
  applying = run.catch(() => undefined);
  return run;
}

async function applyNow(
  bookmarks: Bookmarks,
  revision: string,
  operations: Operation[],
): Promise<ApplyOperationsResult> {
  // The server checked the plan against the tree at `revision`. Checking again just before the first change narrows
  // the gap in which the person could change the tree under the plan.
  if ((await revisionOf(await readTree(bookmarks))) !== revision) {
    throw new RequestError(
      ErrorCode.revisionMismatch,
      "The bookmarks changed; call get_tree again and rewrite the plan.",
    );
  }
  // A map, not an object, so no ref can name one of an object's own properties, such as "constructor".
  const created = new Map<string, string>();
  // Keys start with "$" and Chrome's IDs are digits, so a ref that is not a key is an ID.
  const id = (ref: string) => created.get(ref) ?? ref;
  let applied = 0;
  let failed: ApplyOperationsResult["failed"];
  for (const [index, operation] of operations.entries()) {
    try {
      await run(operation);
    } catch (error) {
      // Chrome has no transactions: the operations before stay applied, and nothing rolls them back, since a rollback
      // could fail too.
      failed = { operation: index, message: error instanceof Error ? error.message : String(error) };
      break;
    }
    applied++;
  }
  const after = await revisionOf(await readTree(bookmarks));
  return { applied, created: Object.fromEntries(created), revision: after, ...(failed && { failed }) };

  async function run(operation: Operation): Promise<void> {
    if (operation.op === "create") {
      const { key, parent, title, url, index } = operation;
      const node = await bookmarks.create({ parentId: id(parent), title, url, index });
      if (key !== undefined) created.set(key, node.id);
    } else if (operation.op === "move") {
      await bookmarks.move(id(operation.node), { parentId: id(operation.parent), index: operation.index });
    } else if (operation.op === "rename") {
      await bookmarks.update(id(operation.node), { title: operation.title });
    } else {
      await bookmarks.remove(id(operation.node));
    }
  }
}

/** The tree as the server sees it, so the revision is the one `get_tree` reports. */
async function readTree(bookmarks: Bookmarks) {
  const [root] = await bookmarks.getTree();
  return toTree(root?.children);
}
