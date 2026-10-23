// The bookmark tree the agent sees, from the spec's "Bookmark tree" section: docs/spec.md#nodes and #outline.

import { z } from "zod";

const FolderType = z.enum(["bookmarks-bar", "other", "mobile"]).describe("Special folders only");
const Syncing = z.boolean().describe("Special folders only: true for account storage, false for local storage");

export const Bookmark = z.strictObject({
  id: z.string(),
  title: z.string(),
  url: z.string(),
});
export type Bookmark = z.infer<typeof Bookmark>;

export const Folder = z.strictObject({
  id: z.string(),
  title: z.string(),
  get children(): z.ZodArray<typeof TreeNode> {
    return z.array(TreeNode);
  },
  folderType: FolderType.optional(),
  syncing: Syncing.optional(),
});
export type Folder = z.infer<typeof Folder>;

export const TreeNode = z.union([Bookmark, Folder]);
export type TreeNode = z.infer<typeof TreeNode>;

/** A folder without its bookmarks, which `get_tree` returns when the whole tree would be too large. */
export const OutlineFolder = z.strictObject({
  id: z.string(),
  title: z.string(),
  bookmarkCount: z.int().describe("Bookmarks directly in this folder"),
  get children(): z.ZodArray<typeof OutlineFolder> {
    return z.array(OutlineFolder);
  },
  folderType: FolderType.optional(),
  syncing: Syncing.optional(),
});
export type OutlineFolder = z.infer<typeof OutlineFolder>;
