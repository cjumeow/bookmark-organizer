import { describe, expect, it } from "vitest";

import { selectTree, UnknownFolderError } from "./select-tree.js";
import type { TreeNode } from "./tree.js";

// The tree of revision.test.ts, whose revision was worked out with shasum there.
const tree: TreeNode[] = [
  {
    id: "1",
    title: "Bookmarks bar",
    children: [
      { id: "10", title: "Example: a test site", url: "https://example.com/" },
      {
        id: "11",
        title: "Tools 工具",
        children: [{ id: "12", title: "Example Org: another test site", url: "https://example.org/" }],
      },
    ],
    folderType: "bookmarks-bar",
    syncing: false,
  },
  { id: "2", title: "Other bookmarks", children: [], folderType: "other", syncing: false },
];

describe("selectTree", () => {
  it("returns the whole tree with its revision", async () => {
    expect(await selectTree(tree)).toStrictEqual({ revision: "9e3e6f0f616711c1", tree });
  });

  it("returns one folder and what is inside it, with the revision of the whole tree", async () => {
    expect(await selectTree(tree, "11")).toStrictEqual({
      revision: "9e3e6f0f616711c1",
      tree: [
        {
          id: "11",
          title: "Tools 工具",
          children: [{ id: "12", title: "Example Org: another test site", url: "https://example.org/" }],
        },
      ],
    });
  });

  it.each([
    ["no node", "99"],
    ["a bookmark", "10"],
  ])("refuses a folderId that names %s", async (_names, folderId) => {
    await expect(selectTree(tree, folderId)).rejects.toThrow(UnknownFolderError);
  });

  describe("past 80,000 characters of JSON", () => {
    // Without its title, this tree's JSON is 146 characters, counted with
    // printf '%s' '[{"id":"1","title":"Bookmarks bar","children":[{"id":"10","title":"","url":"https://example.com/"}],
    //   "folderType":"bookmarks-bar","syncing":false}]' | wc -c
    // on the string as one line.
    const treeWithTitleOf = (length: number): TreeNode[] => [
      {
        id: "1",
        title: "Bookmarks bar",
        children: [{ id: "10", title: "x".repeat(length), url: "https://example.com/" }],
        folderType: "bookmarks-bar",
        syncing: false,
      },
    ];

    it("returns the tree when its JSON is exactly 80,000 characters", async () => {
      const exactly = treeWithTitleOf(80_000 - 146);

      expect(await selectTree(exactly)).toMatchObject({ tree: exactly });
    });

    it("returns an outline when its JSON is one character more", async () => {
      expect(await selectTree(treeWithTitleOf(80_000 - 146 + 1))).toMatchObject({
        outline: [
          {
            id: "1",
            title: "Bookmarks bar",
            bookmarkCount: 1,
            children: [],
            folderType: "bookmarks-bar",
            syncing: false,
          },
        ],
      });
    });

    it("counts in each folder of the outline only the bookmarks directly in it", async () => {
      const large: TreeNode[] = [
        {
          id: "1",
          title: "Bookmarks bar",
          children: [
            { id: "10", title: "Example: a test site", url: `https://example.com/?q=${"x".repeat(80_000)}` },
            {
              id: "11",
              title: "Tools",
              children: [
                { id: "110", title: "Example Org: another test site", url: "https://example.org/" },
                { id: "111", title: "Example Net: a third test site", url: "https://example.net/" },
                {
                  id: "112",
                  title: "Deep",
                  children: [{ id: "1120", title: "Example: a page", url: "https://example.com/page" }],
                },
              ],
            },
            { id: "12", title: "Example Org: a page", url: "https://example.org/page" },
          ],
          folderType: "bookmarks-bar",
          syncing: false,
        },
        { id: "2", title: "Other bookmarks", children: [], folderType: "other", syncing: false },
      ];

      expect(await selectTree(large)).toStrictEqual({
        revision: expect.any(String) as string,
        outline: [
          {
            id: "1",
            title: "Bookmarks bar",
            bookmarkCount: 2,
            children: [
              {
                id: "11",
                title: "Tools",
                bookmarkCount: 2,
                children: [{ id: "112", title: "Deep", bookmarkCount: 1, children: [] }],
              },
            ],
            folderType: "bookmarks-bar",
            syncing: false,
          },
          { id: "2", title: "Other bookmarks", bookmarkCount: 0, children: [], folderType: "other", syncing: false },
        ],
      });
    });
  });
});
