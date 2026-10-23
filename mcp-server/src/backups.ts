// Backups of the bookmark tree, from the spec's "Backups" section: docs/spec.md#backups. The MCP server writes one
// before it applies a plan; each holds the whole tree and the plan applied after it.

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir as homedirOf } from "node:os";
import { join } from "node:path";

import { Plan, TreeNode } from "@bookmark-organizer/shared";
import { z } from "zod";

export const BackupFile = z.strictObject({
  formatVersion: z.literal(1),
  id: z.string(),
  createdAt: z.string().describe("ISO 8601"),
  version: z.string().describe("Bookmark Organizer's version"),
  revision: z.string().describe("Of the tree at the time"),
  tree: z.array(TreeNode).describe("The whole tree, as get_tree returns it"),
  plan: Plan.describe("The plan applied after the backup was taken"),
});
export type BackupFile = z.infer<typeof BackupFile>;

export interface BackupSummary {
  id: string;
  createdAt: string;
  bookmarks: number;
  folders: number;
  /** In the plan applied after the backup was taken. */
  operations: number;
}

export interface BackupStore {
  /** Writes a backup under a new ID and resolves once the file is complete. Never overwrites one. */
  write(backup: Pick<BackupFile, "version" | "revision" | "tree" | "plan">): Promise<BackupFile>;
  /** The backups, newest first. */
  list(): Promise<BackupSummary[]>;
  read(id: string): Promise<BackupFile>;
}

export interface BackupStoreOptions {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  homedir?: string;
  now?: () => Date;
}

export class UnknownBackupError extends Error {
  constructor(id: string) {
    super(`Backup ${id} does not exist.`);
    this.name = "UnknownBackupError";
  }
}

/** A backup's ID: the UTC second it was taken, and `-2`, `-3`… for a second, third… backup in the same second. */
const ID = /^(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ)(?:-(\d+))?$/;

export function createBackupStore({
  env = process.env,
  platform = process.platform,
  homedir = homedirOf(),
  now = () => new Date(),
}: BackupStoreOptions = {}): BackupStore {
  const folder = join(dataFolder(env, platform, homedir), "backups");

  async function read(id: string): Promise<BackupFile> {
    return BackupFile.parse(JSON.parse(await readFile(join(folder, `${id}.json`), "utf8")));
  }

  return {
    async write({ version, revision, tree, plan }) {
      const createdAt = now().toISOString();
      // 2026-10-23T14:05:00.123Z → 2026-10-23T14-05-00Z
      const second = `${createdAt.slice(0, 19).replaceAll(":", "-")}Z`;
      // A backup holds every URL, so only this user may read it. The modes apply to what is created here; umask can
      // only remove permissions, never add them.
      await mkdir(folder, { recursive: true, mode: 0o700 });
      // "wx" creates the file only when no file has its name, so a backup is never overwritten, even by another
      // server writing in the same second.
      for (let n = 1; ; n++) {
        const id = n === 1 ? second : `${second}-${String(n)}`;
        const backup: BackupFile = { formatVersion: 1, id, createdAt, version, revision, tree, plan };
        const path = join(folder, `${id}.json`);
        try {
          await writeFile(path, JSON.stringify(backup), { flag: "wx", mode: 0o600 });
          return backup;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
          // Any other failure, such as a full disk, may leave part of a file, which "wx" means is this one: remove it,
          // so no unreadable backup is left to list.
          await rm(path, { force: true });
          throw error;
        }
      }
    },

    async list() {
      let names: string[];
      try {
        names = await readdir(folder);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
      const ids = names.flatMap((name) => {
        const id = name.replace(/\.json$/, "");
        return name.endsWith(".json") && ID.test(id) ? [id] : [];
      });
      ids.sort(newestFirst);
      return Promise.all(
        ids.map(async (id) => {
          const backup = await read(id);
          return { id, createdAt: backup.createdAt, ...count(backup.tree), operations: backup.plan.operations.length };
        }),
      );
    },

    async read(id) {
      // Only a backup's name, so an ID never reaches a file outside the folder.
      if (!ID.test(id)) throw new UnknownBackupError(id);
      try {
        return await read(id);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new UnknownBackupError(id);
        throw error;
      }
    },
  };
}

/** The per-user folder the server keeps its data in, which BOOKMARK_ORGANIZER_DATA_DIR replaces. */
function dataFolder(env: Record<string, string | undefined>, platform: NodeJS.Platform, homedir: string): string {
  // An empty variable counts as unset, so it never means the current folder.
  const variable = (name: string) => (env[name] === "" ? undefined : env[name]);
  const replaced = variable("BOOKMARK_ORGANIZER_DATA_DIR");
  if (replaced !== undefined) return replaced;
  if (platform === "darwin") return join(homedir, "Library", "Application Support", "bookmark-organizer");
  if (platform === "win32")
    return join(variable("APPDATA") ?? join(homedir, "AppData", "Roaming"), "bookmark-organizer");
  return join(variable("XDG_DATA_HOME") ?? join(homedir, ".local", "share"), "bookmark-organizer");
}

/** Orders IDs newest first: by their second, then by their suffix as a number, so `-10` comes before `-9`. */
function newestFirst(a: string, b: string): number {
  const [, aSecond = "", aSuffix = "1"] = ID.exec(a) ?? [];
  const [, bSecond = "", bSuffix = "1"] = ID.exec(b) ?? [];
  return bSecond.localeCompare(aSecond) || Number(bSuffix) - Number(aSuffix);
}

/** The bookmarks and folders a tree holds; special folders are not counted, since every tree has them. */
function count(tree: TreeNode[]): { bookmarks: number; folders: number } {
  let bookmarks = 0;
  let folders = 0;
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if ("url" in node) {
        bookmarks++;
      } else {
        if (node.folderType === undefined) folders++;
        walk(node.children);
      }
    }
  };
  walk(tree);
  return { bookmarks, folders };
}
