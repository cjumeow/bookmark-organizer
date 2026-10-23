import { describe, expect, it } from "vitest";

import { revisionOf } from "./revision.js";
import type { Folder, TreeNode } from "./tree.js";

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

describe("revisionOf", () => {
  it("is the first 16 hexadecimal characters of the SHA-256 of every node's id, parent, position, title and url", async () => {
    // Worked out apart from the code, with
    // printf '%s' '[["1",null,0,"Bookmarks bar",null],["10","1",0,"Example: a test site","https://example.com/"],
    //   ["11","1",1,"Tools 工具",null],["12","11",0,"Example Org: another test site","https://example.org/"],
    //   ["2",null,1,"Other bookmarks",null]]' | shasum -a 256 | cut -c1-16
    // on the string as one line.
    expect(await revisionOf(tree)).toBe("9e3e6f0f616711c1");
  });

  it.each<[string, (bar: Folder, tools: Folder, other: Folder) => void]>([
    [
      "a bookmark moves to another folder",
      (bar, _tools, other) => {
        bar.children.splice(0, 1);
        other.children.push({ id: "10", title: "Example: a test site", url: "https://example.com/" });
      },
    ],
    ["a node moves within its folder", (bar) => bar.children.reverse()],
    [
      "a bookmark moves out of its folder to just after it, so the order of the nodes stays the same",
      (bar, tools) => {
        tools.children = [];
        bar.children.push({ id: "12", title: "Example Org: another test site", url: "https://example.org/" });
      },
    ],
    [
      "a folder is renamed",
      (_bar, tools) => {
        tools.title = "Tools";
      },
    ],
    [
      "a bookmark gets a new URL",
      (_bar, tools) => {
        tools.children = [{ id: "12", title: "Example Org: another test site", url: "https://example.org/new" }];
      },
    ],
    [
      "a bookmark is added",
      (_bar, _tools, other) => {
        other.children.push({ id: "20", title: "Example Net: a third test site", url: "https://example.net/" });
      },
    ],
    [
      "a bookmark is removed",
      (_bar, tools) => {
        tools.children = [];
      },
    ],
  ])("changes when %s", async (_change, edit) => {
    const changed = structuredClone(tree) as [Folder, Folder];
    const [bar, other] = changed;
    edit(bar, bar.children[1] as Folder, other);

    expect(await revisionOf(changed)).not.toBe(await revisionOf(tree));
  });

  it("does not change when the same tree is built with its fields in another order", async () => {
    const reordered: TreeNode[] = [
      {
        syncing: false,
        folderType: "bookmarks-bar",
        children: [
          { url: "https://example.com/", title: "Example: a test site", id: "10" },
          {
            children: [{ url: "https://example.org/", title: "Example Org: another test site", id: "12" }],
            title: "Tools 工具",
            id: "11",
          },
        ],
        title: "Bookmarks bar",
        id: "1",
      },
      { syncing: false, folderType: "other", children: [], title: "Other bookmarks", id: "2" },
    ];

    expect(await revisionOf(reordered)).toBe(await revisionOf(tree));
  });
});
