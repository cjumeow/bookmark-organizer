import type { Operation, TreeNode } from "@bookmark-organizer/shared";
import { describe, expect, it } from "vitest";

import { checkPlan } from "./check-plan.js";

const REVISION = "0123456789abcdef";

// Made-up bookmarks in one storage: a bar with a folder and a bookmark, and an empty Other bookmarks.
function localTree(): TreeNode[] {
  return [
    {
      id: "1",
      title: "Bookmarks bar",
      folderType: "bookmarks-bar",
      syncing: false,
      children: [
        {
          id: "10",
          title: "Misc",
          children: [{ id: "11", title: "Example: a test site", url: "https://example.com/" }],
        },
        { id: "12", title: "example.org", url: "https://example.org/" },
      ],
    },
    { id: "2", title: "Other bookmarks", folderType: "other", syncing: false, children: [] },
  ];
}

// Made-up bookmarks in both storages: the account's bar and Other bookmarks, and a local bar, as Chrome 134 lists them
// for a person signed in with bookmarks saved to their account.
function twoStorageTree(): TreeNode[] {
  return [
    {
      id: "1",
      title: "Bookmarks bar",
      folderType: "bookmarks-bar",
      syncing: true,
      children: [{ id: "10", title: "Work", children: [] }],
    },
    { id: "2", title: "Other bookmarks", folderType: "other", syncing: true, children: [] },
    {
      id: "3",
      title: "Bookmarks bar",
      folderType: "bookmarks-bar",
      syncing: false,
      children: [{ id: "30", title: "Example: a test site", url: "https://example.com/" }],
    },
  ];
}

// A bar of four made-up bookmarks, in the order 20, 21, 10, 11, for moves within one folder.
function barTree(): TreeNode[] {
  const bookmark = (id: string, letter: string) => ({
    id,
    title: `Example ${letter}`,
    url: `https://example.com/${letter.toLowerCase()}`,
  });
  return [
    {
      id: "1",
      title: "Bookmarks bar",
      folderType: "bookmarks-bar",
      syncing: false,
      children: [bookmark("20", "A"), bookmark("21", "B"), bookmark("10", "C"), bookmark("11", "D")],
    },
  ];
}

function check(operations: Operation[], tree = localTree()) {
  return checkPlan(tree, REVISION, { revision: REVISION, operations });
}

describe("checkPlan", () => {
  it("accepts a plan with no operations, which changes nothing", () => {
    expect(check([])).toEqual({
      valid: true,
      summary: { foldersCreated: 0, bookmarksCreated: 0, moved: 0, renamed: 0, removed: 0 },
      changes: [],
    });
  });

  it("reports every broken rule at once: of the whole plan, of several operations, and several of one operation", () => {
    const result = checkPlan(localTree(), REVISION, {
      revision: "fedcba9876543210",
      operations: [
        { op: "create", key: "$Bad", parent: "12", title: " ", url: "example.com" },
        { op: "rename", node: "1", title: "Bar" },
      ],
    });

    expect(result).toEqual({
      valid: false,
      errors: [
        { operation: -1, message: "The bookmarks changed; call get_tree again and rewrite the plan." },
        { operation: 0, message: 'parent "12" is a bookmark, not a folder' },
        { operation: 0, message: 'key "$Bad" is not "$" followed by lowercase letters, digits and hyphens' },
        { operation: 0, message: "the title is empty" },
        { operation: 0, message: 'the URL "example.com" is not an absolute URL' },
        { operation: 1, message: 'node "1" is a special folder, which cannot be renamed' },
      ],
    });
  });

  it("runs the plan on a copy, leaving the tree it is given as it was", () => {
    const tree = localTree();

    check(
      [
        { op: "create", key: "$reference", parent: "2", title: "Reference" },
        { op: "move", node: "11", parent: "$reference" },
        { op: "rename", node: "12", title: "Example Org: another test site" },
        { op: "remove", node: "10" },
      ],
      tree,
    );

    expect(tree).toEqual(localTree());
  });

  describe("dry run", () => {
    it("describes creating a folder, with its parent's path from the special folder", () => {
      expect(check([{ op: "create", parent: "2", title: "Reference" }])).toEqual({
        valid: true,
        summary: { foldersCreated: 1, bookmarksCreated: 0, moved: 0, renamed: 0, removed: 0 },
        changes: ['create folder "Reference" in "Other bookmarks"'],
      });
    });

    it("describes creating a bookmark in a folder below the special folder", () => {
      expect(
        check([{ op: "create", parent: "10", title: "Example Net: a test site", url: "https://example.net/" }]),
      ).toEqual({
        valid: true,
        summary: { foldersCreated: 0, bookmarksCreated: 1, moved: 0, renamed: 0, removed: 0 },
        changes: ['create bookmark "Example Net: a test site" in "Bookmarks bar/Misc"'],
      });
    });

    it("describes moving a node, with the folder it leaves and the folder it enters", () => {
      expect(check([{ op: "move", node: "11", parent: "2" }])).toEqual({
        valid: true,
        summary: { foldersCreated: 0, bookmarksCreated: 0, moved: 1, renamed: 0, removed: 0 },
        changes: ['move "Example: a test site" from "Bookmarks bar/Misc" to "Other bookmarks"'],
      });
    });

    it("describes renaming a node, with its old and new titles", () => {
      expect(check([{ op: "rename", node: "12", title: "Example Org: another test site" }])).toEqual({
        valid: true,
        summary: { foldersCreated: 0, bookmarksCreated: 0, moved: 0, renamed: 1, removed: 0 },
        changes: ['rename "example.org" to "Example Org: another test site"'],
      });
    });

    it("describes removing a node, with the folder it was in", () => {
      expect(check([{ op: "remove", node: "11" }])).toEqual({
        valid: true,
        summary: { foldersCreated: 0, bookmarksCreated: 0, moved: 0, renamed: 0, removed: 1 },
        changes: ['remove "Example: a test site" from "Bookmarks bar/Misc"'],
      });
    });

    it("refers by its key to a folder an earlier operation creates", () => {
      const result = check([
        { op: "create", key: "$reference", parent: "2", title: "Reference" },
        { op: "create", key: "$docs", parent: "$reference", title: "Docs" },
        { op: "move", node: "11", parent: "$docs" },
      ]);

      expect(result).toEqual({
        valid: true,
        summary: { foldersCreated: 2, bookmarksCreated: 0, moved: 1, renamed: 0, removed: 0 },
        changes: [
          'create folder "Reference" in "Other bookmarks"',
          'create folder "Docs" in "Other bookmarks/Reference"',
          'move "Example: a test site" from "Bookmarks bar/Misc" to "Other bookmarks/Reference/Docs"',
        ],
      });
    });

    it("says where a node created at an index lands: before the node that follows it", () => {
      expect(check([{ op: "create", parent: "1", title: "Reference", index: 1 }])).toMatchObject({
        valid: true,
        changes: ['create folder "Reference" in "Bookmarks bar", before "example.org"'],
      });
    });

    // Moving within one folder: chrome.bookmarks.move counts the index in the folder as it is before the node leaves it,
    // so a node moving later lands just before the node at that index. #11 runs these cases in real Chrome; if Chrome
    // disagrees there, Chrome wins and checkPlan is fixed.
    describe("moving a node within its own folder", () => {
      it("to a later index lands before the node that was at that index", () => {
        // A B C D, move A to index 2 (before C): B A C D.
        expect(check([{ op: "move", node: "20", parent: "1", index: 2 }], barTree())).toMatchObject({
          valid: true,
          changes: ['move "Example A" from "Bookmarks bar" to "Bookmarks bar", before "Example C"'],
        });
      });

      it("to the index past the last node lands at the end", () => {
        // A B C D, move A to index 4: B C D A.
        expect(check([{ op: "move", node: "20", parent: "1", index: 4 }], barTree())).toMatchObject({
          valid: true,
          changes: ['move "Example A" from "Bookmarks bar" to "Bookmarks bar", at the end'],
        });
      });

      it("to an earlier index lands at that index", () => {
        // A B C D, move D to index 1: A D B C.
        expect(check([{ op: "move", node: "11", parent: "1", index: 1 }], barTree())).toMatchObject({
          valid: true,
          changes: ['move "Example D" from "Bookmarks bar" to "Bookmarks bar", before "Example B"'],
        });
      });

      it("leaves the order it made for the operations after it", () => {
        // A B C D, move A to index 2: B A C D; then move D to index 1: B D A C; then C to index 0: C B D A.
        const result = check(
          [
            { op: "move", node: "20", parent: "1", index: 2 },
            { op: "move", node: "11", parent: "1", index: 1 },
            { op: "move", node: "10", parent: "1", index: 0 },
          ],
          barTree(),
        );

        expect(result).toMatchObject({
          valid: true,
          changes: [
            'move "Example A" from "Bookmarks bar" to "Bookmarks bar", before "Example C"',
            'move "Example D" from "Bookmarks bar" to "Bookmarks bar", before "Example A"',
            'move "Example C" from "Bookmarks bar" to "Bookmarks bar", before "Example B"',
          ],
        });
      });
    });

    it("names the storage of a special folder when the tree has both storages", () => {
      const result = check(
        [
          { op: "create", parent: "10", title: "Reference" },
          { op: "rename", node: "30", title: "Example: a renamed test site" },
          { op: "remove", node: "30" },
        ],
        twoStorageTree(),
      );

      expect(result).toMatchObject({
        valid: true,
        changes: [
          'create folder "Reference" in "Bookmarks bar (account)/Work"',
          'rename "Example: a test site" to "Example: a renamed test site"',
          'remove "Example: a renamed test site" from "Bookmarks bar (local)"',
        ],
      });
    });
  });

  describe("rule 1: the plan's revision is the current tree's", () => {
    it("refuses a plan written against an older tree, as an error of the whole plan", () => {
      const result = checkPlan(localTree(), REVISION, { revision: "fedcba9876543210", operations: [] });

      expect(result).toEqual({
        valid: false,
        errors: [{ operation: -1, message: "The bookmarks changed; call get_tree again and rewrite the plan." }],
      });
    });
  });

  describe("rule 2: every ID is a node and every key was defined earlier, once", () => {
    it("refuses an ID that is not in the tree", () => {
      expect(check([{ op: "rename", node: "99", title: "Example" }])).toEqual({
        valid: false,
        errors: [{ operation: 0, message: 'node "99" is not in the bookmark tree' }],
      });
    });

    it("refuses moving into a folder an earlier operation removed, though the move is valid on its own", () => {
      const result = check([
        { op: "remove", node: "11" },
        { op: "remove", node: "10" },
        { op: "move", node: "12", parent: "10" },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [{ operation: 2, message: 'parent "10" was removed by operation 1' }],
      });
    });

    it("refuses a key used before the create that defines it", () => {
      const result = check([
        { op: "move", node: "11", parent: "$reference" },
        { op: "create", key: "$reference", parent: "2", title: "Reference" },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [{ operation: 0, message: 'parent "$reference" is not a key defined by an earlier create' }],
      });
    });

    it("says a key names nothing when the create that defines it is invalid", () => {
      const result = check([
        { op: "create", key: "$reference", parent: "2", title: "" },
        { op: "move", node: "11", parent: "$reference" },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [
          { operation: 0, message: "the title is empty" },
          { operation: 1, message: 'parent "$reference" names nothing: operation 0, which creates it, is invalid' },
        ],
      });
    });

    it("refuses a key whose folder an earlier operation removed", () => {
      const result = check([
        { op: "create", key: "$reference", parent: "2", title: "Reference" },
        { op: "remove", node: "$reference" },
        { op: "move", node: "11", parent: "$reference" },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [{ operation: 2, message: 'parent "$reference" was removed by operation 1' }],
      });
    });

    it("refuses a key defined twice", () => {
      const result = check([
        { op: "create", key: "$reference", parent: "2", title: "Reference" },
        { op: "create", key: "$reference", parent: "1", title: "Reference" },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [{ operation: 1, message: 'key "$reference" is already defined by operation 0' }],
      });
    });

    it("refuses a key that is not a $ and lowercase letters, digits and hyphens, so no key looks like an ID", () => {
      const result = check([
        { op: "create", key: "$Reference", parent: "2", title: "Reference" },
        { op: "create", key: "12", parent: "2", title: "Docs" },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [
          { operation: 0, message: 'key "$Reference" is not "$" followed by lowercase letters, digits and hyphens' },
          { operation: 1, message: 'key "12" is not "$" followed by lowercase letters, digits and hyphens' },
        ],
      });
    });
  });

  describe("rule 3: a parent is a folder", () => {
    it("refuses a bookmark as the parent of a move or a create", () => {
      const result = check([
        { op: "move", node: "11", parent: "12" },
        { op: "create", parent: "12", title: "Reference" },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [
          { operation: 0, message: 'parent "12" is a bookmark, not a folder' },
          { operation: 1, message: 'parent "12" is a bookmark, not a folder' },
        ],
      });
    });
  });

  describe("rule 4: special folders stay where they are, and the top level holds only them", () => {
    it("refuses moving, renaming or removing a special folder", () => {
      const result = check([
        { op: "move", node: "2", parent: "1" },
        { op: "rename", node: "1", title: "Bar" },
        { op: "remove", node: "2" },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [
          { operation: 0, message: 'node "2" is a special folder, which cannot be moved' },
          { operation: 1, message: 'node "1" is a special folder, which cannot be renamed' },
          { operation: 2, message: 'node "2" is a special folder, which cannot be removed' },
        ],
      });
    });

    it("refuses creating in or moving to the top level, since Chrome's root is not a node of the tree", () => {
      // Chrome's root is "0"; get_tree leaves it out, so no plan can name it.
      const result = check([
        { op: "create", parent: "0", title: "Reference" },
        { op: "move", node: "10", parent: "0" },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [
          { operation: 0, message: 'parent "0" is not in the bookmark tree' },
          { operation: 1, message: 'parent "0" is not in the bookmark tree' },
        ],
      });
    });
  });

  describe("rule 5: no folder moves into itself or a folder inside it", () => {
    it("refuses moving a folder into itself and into a folder inside it", () => {
      const result = check([
        { op: "create", key: "$inside", parent: "10", title: "Inside" },
        { op: "move", node: "10", parent: "10" },
        { op: "move", node: "10", parent: "$inside" },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [
          { operation: 1, message: 'folder "10" cannot move into itself or a folder inside it' },
          { operation: 2, message: 'folder "10" cannot move into itself or a folder inside it' },
        ],
      });
    });
  });

  describe("rule 6: no node moves to another storage", () => {
    it("refuses a move between local and account storage, and allows one between folders of one storage", () => {
      const result = check(
        [
          { op: "move", node: "30", parent: "10" },
          { op: "move", node: "10", parent: "2" },
        ],
        twoStorageTree(),
      );

      expect(result).toEqual({
        valid: false,
        errors: [{ operation: 0, message: 'node "30" would move from local storage to account storage' }],
      });
    });
  });

  describe("rule 7: a removed folder is empty at that point", () => {
    it("refuses removing a folder that holds a node, and allows it once an earlier operation moved that out", () => {
      const result = check([
        { op: "remove", node: "10" },
        { op: "move", node: "11", parent: "2" },
        { op: "remove", node: "10" },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [{ operation: 0, message: 'folder "10" is not empty: move or remove what is inside it first' }],
      });
    });
  });

  describe("rule 8: titles are not empty, URLs are absolute, and an index is within its folder", () => {
    it("refuses an empty title, or one of only spaces, in a create or a rename", () => {
      const result = check([
        { op: "create", parent: "2", title: "" },
        { op: "rename", node: "12", title: "   " },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [
          { operation: 0, message: "the title is empty" },
          { operation: 1, message: "the title is empty" },
        ],
      });
    });

    it("refuses a URL that is not absolute", () => {
      const result = check([{ op: "create", parent: "2", title: "Example: a test site", url: "example.com/docs" }]);

      expect(result).toEqual({
        valid: false,
        errors: [{ operation: 0, message: 'the URL "example.com/docs" is not an absolute URL' }],
      });
    });

    it("refuses an index below 0 or past the number of children the parent has at that point", () => {
      // "Bookmarks bar" holds two nodes, so 0 to 2 are valid; "Other bookmarks" holds none until operation 2, one until
      // operation 4.
      const result = check([
        { op: "create", parent: "1", title: "Reference", index: 3 },
        { op: "move", node: "12", parent: "2", index: -1 },
        { op: "move", node: "11", parent: "2", index: 0 },
        { op: "create", parent: "2", title: "Docs", index: 2 },
        { op: "create", parent: "2", title: "Docs", index: 1 },
        { op: "move", node: "10", parent: "2", index: 3 },
      ]);

      expect(result).toEqual({
        valid: false,
        errors: [
          { operation: 0, message: 'index 3 is outside "Bookmarks bar", which holds 2 nodes: use 0 to 2' },
          { operation: 1, message: 'index -1 is outside "Other bookmarks", which holds 0 nodes: use 0 to 0' },
          { operation: 3, message: 'index 2 is outside "Other bookmarks", which holds 1 node: use 0 to 1' },
          { operation: 5, message: 'index 3 is outside "Other bookmarks", which holds 2 nodes: use 0 to 2' },
        ],
      });
    });
  });
});
