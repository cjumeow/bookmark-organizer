import type { TreeNode } from "@bookmark-organizer/shared";
import { describe, expect, it } from "vitest";

import { checkPlan } from "./check-plan.js";
import { restorePlan } from "./restore-plan.js";

// The tree a backup holds: made-up bookmarks in one storage, a bar with a folder and a bookmark, and an empty Other
// bookmarks.
function backupTree(): TreeNode[] {
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

describe("restorePlan", () => {
  it("moves and renames back a node that is still there", () => {
    const current: TreeNode[] = [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          { id: "10", title: "Misc", children: [] },
          { id: "12", title: "example.org", url: "https://example.org/" },
        ],
      },
      {
        id: "2",
        title: "Other bookmarks",
        folderType: "other",
        syncing: false,
        children: [{ id: "11", title: "Example", url: "https://example.com/" }],
      },
    ];

    expect(restorePlan(backupTree(), current)).toEqual({
      operations: [
        { op: "move", node: "11", parent: "10", index: 0 },
        { op: "rename", node: "11", title: "Example: a test site" },
      ],
      skipped: [],
    });
  });

  it("creates a removed folder and a removed bookmark inside it again, parent first, keyed by their old IDs", () => {
    const current: TreeNode[] = [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [{ id: "12", title: "example.org", url: "https://example.org/" }],
      },
      { id: "2", title: "Other bookmarks", folderType: "other", syncing: false, children: [] },
    ];

    expect(restorePlan(backupTree(), current)).toEqual({
      operations: [
        { op: "create", key: "$restore-10", parent: "1", title: "Misc", index: 0 },
        {
          op: "create",
          key: "$restore-11",
          parent: "$restore-10",
          title: "Example: a test site",
          url: "https://example.com/",
          index: 0,
        },
      ],
      skipped: [],
    });
  });

  it("keeps a bookmark added after the backup in its folder, after the restored nodes", () => {
    const current: TreeNode[] = [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          { id: "20", title: "Example Net", url: "https://example.net/" },
          { id: "12", title: "example.org", url: "https://example.org/" },
          {
            id: "10",
            title: "Misc",
            children: [{ id: "11", title: "Example: a test site", url: "https://example.com/" }],
          },
        ],
      },
      { id: "2", title: "Other bookmarks", folderType: "other", syncing: false, children: [] },
    ];

    expect(restorePlan(backupTree(), current)).toEqual({
      operations: [
        { op: "move", node: "10", parent: "1", index: 0 },
        { op: "move", node: "12", parent: "1", index: 1 },
      ],
      skipped: [],
    });
  });

  it("removes a folder that is not in the backup when the restore leaves it empty, and keeps one that is not", () => {
    const current: TreeNode[] = [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          { id: "10", title: "Misc", children: [] },
          { id: "12", title: "example.org", url: "https://example.org/" },
        ],
      },
      {
        id: "2",
        title: "Other bookmarks",
        folderType: "other",
        syncing: false,
        children: [
          {
            id: "30",
            title: "Reference",
            children: [
              { id: "31", title: "Docs", children: [] },
              { id: "11", title: "Example: a test site", url: "https://example.com/" },
            ],
          },
          {
            id: "32",
            title: "Inbox",
            children: [{ id: "20", title: "Example Net", url: "https://example.net/" }],
          },
        ],
      },
    ];

    expect(restorePlan(backupTree(), current)).toEqual({
      operations: [
        { op: "move", node: "11", parent: "10", index: 0 },
        { op: "remove", node: "31" },
        { op: "remove", node: "30" },
      ],
      skipped: [],
    });
  });

  it("skips the nodes of a special folder that no longer exists", () => {
    // The backup was taken while the person was signed in, with an account bar beside the local one.
    const backup: TreeNode[] = [
      ...backupTree(),
      {
        id: "3",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: true,
        children: [
          {
            id: "40",
            title: "Work",
            children: [{ id: "41", title: "Example Net", url: "https://example.net/" }],
          },
        ],
      },
    ];

    expect(restorePlan(backup, backupTree())).toEqual({
      operations: [],
      skipped: [{ id: "40", title: "Work", reason: 'its special folder, "Bookmarks bar" in account storage, is gone' }],
    });
  });

  it("skips a node that is now in the other storage, which a plan may not move it out of", () => {
    const accountBar = (children: TreeNode[]): TreeNode => ({
      id: "3",
      title: "Bookmarks bar",
      folderType: "bookmarks-bar",
      syncing: true,
      children,
    });
    const backup: TreeNode[] = [...backupTree(), accountBar([])];
    const [localBar, other] = backupTree();
    if (!localBar || !("children" in localBar) || !other) throw new Error("the backup tree has changed");
    localBar.children = localBar.children.filter(({ id }) => id !== "12");
    const current: TreeNode[] = [
      localBar,
      other,
      accountBar([{ id: "12", title: "example.org", url: "https://example.org/" }]),
    ];

    expect(restorePlan(backup, current)).toEqual({
      operations: [],
      skipped: [
        {
          id: "12",
          title: "example.org",
          reason: "it is in account storage now, and a plan may not move it back to local storage",
        },
      ],
    });
  });

  it("returns a plan that passes checkPlan", () => {
    // The backup's tree after a reorganization: Misc removed once its bookmark moved to a new Reference folder,
    // example.org renamed, and a bookmark the person added since.
    const current: TreeNode[] = [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          { id: "20", title: "Example Net", url: "https://example.net/" },
          { id: "12", title: "Example Org: another test site", url: "https://example.org/" },
        ],
      },
      {
        id: "2",
        title: "Other bookmarks",
        folderType: "other",
        syncing: false,
        children: [
          {
            id: "30",
            title: "Reference",
            children: [{ id: "11", title: "Example: a test site", url: "https://example.com/" }],
          },
        ],
      },
    ];
    const revision = "0123456789abcdef";

    const { operations } = restorePlan(backupTree(), current);

    expect(checkPlan(current, revision, { revision, operations })).toEqual({
      valid: true,
      summary: { foldersCreated: 1, bookmarksCreated: 0, moved: 2, renamed: 1, removed: 1 },
      changes: [
        'create folder "Misc" in "Bookmarks bar", before "Example Net"',
        'move "Example: a test site" from "Other bookmarks/Reference" to "Bookmarks bar/Misc", at the end',
        'move "Example Org: another test site" from "Bookmarks bar" to "Bookmarks bar", before "Example Net"',
        'rename "Example Org: another test site" to "example.org"',
        'remove "Reference" from "Other bookmarks"',
      ],
    });
  });

  it("restores an empty title as it can, since a plan may not set one, and says so", () => {
    // Chrome lets a bookmark have no title, as the icon-only bookmarks on a bar do.
    const backup: TreeNode[] = [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          { id: "12", title: "", url: "https://example.org/" },
          { id: "13", title: "", url: "https://example.net/" },
        ],
      },
    ];
    const current: TreeNode[] = [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [{ id: "12", title: "Example Org", url: "https://example.org/" }],
      },
    ];

    expect(restorePlan(backup, current)).toEqual({
      operations: [
        {
          op: "create",
          key: "$restore-13",
          parent: "1",
          title: "https://example.net/",
          url: "https://example.net/",
          index: 1,
        },
      ],
      skipped: [
        { id: "12", title: "", reason: 'its title was empty, which a plan cannot set, so it keeps "Example Org"' },
        {
          id: "13",
          title: "",
          reason: 'its title was empty, which a plan cannot set, so it is created as "https://example.net/"',
        },
      ],
    });
  });

  it("creates a node again when its ID now names a node of another kind or a bookmark with another URL", () => {
    // Chrome can give IDs out again, as after the bookmarks are imported or merged by Sync.
    const current: TreeNode[] = [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          { id: "10", title: "Example News", url: "https://example.net/news" },
          { id: "12", title: "Example Shop", url: "https://example.org/shop" },
        ],
      },
      { id: "2", title: "Other bookmarks", folderType: "other", syncing: false, children: [] },
    ];

    expect(restorePlan(backupTree(), current)).toEqual({
      operations: [
        { op: "create", key: "$restore-10", parent: "1", title: "Misc", index: 0 },
        {
          op: "create",
          key: "$restore-11",
          parent: "$restore-10",
          title: "Example: a test site",
          url: "https://example.com/",
          index: 0,
        },
        {
          op: "create",
          key: "$restore-12",
          parent: "1",
          title: "example.org",
          url: "https://example.org/",
          index: 1,
        },
      ],
      skipped: [],
    });
  });
});
