import { describe, expect, it } from "vitest";

import { toTree } from "./chrome-node.js";

describe("toTree", () => {
  it("keeps the special folders of both storages, with folderType and syncing on them only and no dates", () => {
    // What Chrome 134 returns below the root for a profile with local and account storage.
    const chromeNodes = [
      {
        id: "1",
        title: "Bookmarks bar",
        index: 0,
        parentId: "0",
        dateAdded: 1700000000000,
        dateGroupModified: 1700000100000,
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          {
            id: "10",
            title: "Example: a test site",
            url: "https://example.com/",
            index: 0,
            parentId: "1",
            dateAdded: 1700000200000,
            dateLastUsed: 1700000300000,
            syncing: false,
          },
          {
            id: "11",
            title: "Tools",
            index: 1,
            parentId: "1",
            dateAdded: 1700000400000,
            syncing: false,
            children: [
              {
                id: "12",
                title: "Example Org: another test site",
                url: "https://example.org/",
                index: 0,
                parentId: "11",
                syncing: false,
              },
            ],
          },
        ],
      },
      { id: "2", title: "Other bookmarks", index: 1, parentId: "0", folderType: "other", syncing: false, children: [] },
      {
        id: "3",
        title: "Mobile bookmarks",
        index: 2,
        parentId: "0",
        folderType: "mobile",
        syncing: false,
        children: [],
      },
      {
        id: "4",
        title: "Bookmarks bar",
        index: 3,
        parentId: "0",
        folderType: "bookmarks-bar",
        syncing: true,
        children: [
          {
            id: "40",
            title: "Example Net: a site in the account",
            url: "https://example.net/",
            index: 0,
            parentId: "4",
            syncing: true,
          },
        ],
      },
    ];

    expect(toTree(chromeNodes)).toStrictEqual([
      {
        id: "1",
        title: "Bookmarks bar",
        children: [
          { id: "10", title: "Example: a test site", url: "https://example.com/" },
          {
            id: "11",
            title: "Tools",
            children: [{ id: "12", title: "Example Org: another test site", url: "https://example.org/" }],
          },
        ],
        folderType: "bookmarks-bar",
        syncing: false,
      },
      { id: "2", title: "Other bookmarks", children: [], folderType: "other", syncing: false },
      { id: "3", title: "Mobile bookmarks", children: [], folderType: "mobile", syncing: false },
      {
        id: "4",
        title: "Bookmarks bar",
        children: [{ id: "40", title: "Example Net: a site in the account", url: "https://example.net/" }],
        folderType: "bookmarks-bar",
        syncing: true,
      },
    ]);
  });

  it("refuses a top-level node that is not a special folder, such as Chrome's root passed by mistake", () => {
    const root = {
      id: "0",
      title: "",
      syncing: false,
      children: [{ id: "1", title: "Bookmarks bar", folderType: "bookmarks-bar", syncing: false, children: [] }],
    };

    expect(() => toTree([root])).toThrow("Node 0 is at the top level but is not a special folder.");
  });

  it("leaves out managed folders and unmodifiable nodes", () => {
    const chromeNodes = [
      {
        id: "1",
        title: "Bookmarks bar",
        folderType: "bookmarks-bar",
        syncing: false,
        children: [
          { id: "10", title: "Example: a test site", url: "https://example.com/", syncing: false },
          {
            id: "11",
            title: "Example Org: set by an administrator",
            url: "https://example.org/",
            syncing: false,
            unmodifiable: "managed",
          },
        ],
      },
      {
        id: "2",
        title: "Managed bookmarks",
        folderType: "managed",
        syncing: false,
        children: [{ id: "20", title: "Example Net: a managed site", url: "https://example.net/", syncing: false }],
      },
    ];

    expect(toTree(chromeNodes)).toStrictEqual([
      {
        id: "1",
        title: "Bookmarks bar",
        children: [{ id: "10", title: "Example: a test site", url: "https://example.com/" }],
        folderType: "bookmarks-bar",
        syncing: false,
      },
    ]);
  });
});
