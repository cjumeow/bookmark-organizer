import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Plan, TreeNode } from "@bookmark-organizer/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBackupStore } from "./backups.js";

// Made-up bookmarks: a bar with a folder of one bookmark and a bookmark, and an empty Other bookmarks.
const TREE: TreeNode[] = [
  {
    id: "1",
    title: "Bookmarks bar",
    folderType: "bookmarks-bar",
    syncing: false,
    children: [
      { id: "10", title: "Misc", children: [{ id: "11", title: "Example: a test site", url: "https://example.com/" }] },
      { id: "12", title: "example.org", url: "https://example.org/" },
    ],
  },
  { id: "2", title: "Other bookmarks", folderType: "other", syncing: false, children: [] },
];

const PLAN: Plan = {
  revision: "0123456789abcdef",
  operations: [{ op: "rename", node: "12", title: "Example Org: another test site" }],
};

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "bookmark-organizer-backups-"));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** A store in the temporary folder, as BOOKMARK_ORGANIZER_DATA_DIR sets it, whose clock reads `times` in turn. */
function store(...times: string[]) {
  const clock = times.map((time) => new Date(time));
  return createBackupStore({
    env: { BOOKMARK_ORGANIZER_DATA_DIR: folder },
    now: () => clock.shift() ?? new Date(times.at(-1) ?? 0),
  });
}

describe("the backup store", () => {
  it("writes the whole tree and the plan to backups/<the UTC time>.json in the data folder", async () => {
    const backup = await store("2026-10-23T14:05:00.123Z").write({
      version: "0.1.0",
      revision: "0123456789abcdef",
      tree: TREE,
      plan: PLAN,
    });

    expect(backup.id).toBe("2026-10-23T14-05-00Z");
    expect(JSON.parse(await readFile(join(folder, "backups", "2026-10-23T14-05-00Z.json"), "utf8"))).toEqual({
      formatVersion: 1,
      id: "2026-10-23T14-05-00Z",
      createdAt: "2026-10-23T14:05:00.123Z",
      version: "0.1.0",
      revision: "0123456789abcdef",
      tree: TREE,
      plan: PLAN,
    });
  });

  it("gives a second and a third backup in the same second -2 and -3, and keeps the first", async () => {
    const backups = store("2026-10-23T14:05:00.100Z", "2026-10-23T14:05:00.200Z", "2026-10-23T14:05:00.900Z");
    const contents = { version: "0.1.0", revision: "0123456789abcdef", tree: TREE, plan: PLAN };

    const ids = [];
    for (let n = 0; n < 3; n++) ids.push((await backups.write(contents)).id);

    expect(ids).toEqual(["2026-10-23T14-05-00Z", "2026-10-23T14-05-00Z-2", "2026-10-23T14-05-00Z-3"]);
    const first = JSON.parse(await readFile(join(folder, "backups", "2026-10-23T14-05-00Z.json"), "utf8")) as {
      createdAt: string;
    };
    expect(first.createdAt).toBe("2026-10-23T14:05:00.100Z");
  });

  it("creates the data folder and its backups folder with mode 0700 and each backup with mode 0600", async () => {
    const dataFolder = join(folder, "bookmark-organizer");
    const backups = createBackupStore({ env: { BOOKMARK_ORGANIZER_DATA_DIR: dataFolder } });

    const { id } = await backups.write({ version: "0.1.0", revision: "0123456789abcdef", tree: TREE, plan: PLAN });

    const mode = async (path: string) => ((await stat(path)).mode & 0o777).toString(8);
    expect({
      data: await mode(dataFolder),
      backups: await mode(join(dataFolder, "backups")),
      file: await mode(join(dataFolder, "backups", `${id}.json`)),
    }).toEqual({ data: "700", backups: "700", file: "600" });
  });

  // The home folder is the temporary folder too, so these never touch the real data folder.
  it.each([
    ["macOS", "darwin", {}, ["Library", "Application Support", "bookmark-organizer"]],
    ["Linux", "linux", {}, [".local", "share", "bookmark-organizer"]],
    ["Linux with XDG_DATA_HOME", "linux", { XDG_DATA_HOME: "xdg" }, ["xdg", "bookmark-organizer"]],
    ["Windows", "win32", { APPDATA: "roaming" }, ["roaming", "bookmark-organizer"]],
  ] as const)(
    "writes to the per-user data folder on %s when BOOKMARK_ORGANIZER_DATA_DIR is unset",
    async (_name, platform, relativeEnv, path) => {
      const env = Object.fromEntries(Object.entries(relativeEnv).map(([name, value]) => [name, join(folder, value)]));
      const backups = createBackupStore({ env, platform, homedir: folder });

      const { id } = await backups.write({ version: "0.1.0", revision: "0123456789abcdef", tree: TREE, plan: PLAN });

      await expect(stat(join(folder, ...path, "backups", `${id}.json`))).resolves.toBeDefined();
    },
  );

  it("lists the backups newest first, with what each holds, ignoring other files in the folder", async () => {
    const backups = store(
      "2026-10-23T14:05:00.100Z",
      "2026-10-23T14:05:00.200Z",
      "2026-10-24T09:00:00.000Z",
      ...Array<string>(9).fill("2026-10-23T14:05:00.300Z"),
    );
    const contents = { version: "0.1.0", revision: "0123456789abcdef", tree: TREE };
    await backups.write({ ...contents, plan: PLAN });
    await backups.write({ ...contents, plan: { ...PLAN, operations: [] } });
    await backups.write({ ...contents, tree: [], plan: PLAN });
    // Nine more in the same second, so the tenth, "-10", sorts after "-9" though it does not as text.
    for (let n = 0; n < 9; n++) await backups.write({ ...contents, plan: PLAN });
    await writeFile(join(folder, "backups", "notes.txt"), "the person's own notes");

    const list = await backups.list();

    expect(list.map(({ id }) => id)).toEqual([
      "2026-10-24T09-00-00Z",
      ...[11, 10, 9, 8, 7, 6, 5, 4, 3].map((n) => `2026-10-23T14-05-00Z-${String(n)}`),
      "2026-10-23T14-05-00Z-2",
      "2026-10-23T14-05-00Z",
    ]);
    expect(list.at(-2)).toEqual({
      id: "2026-10-23T14-05-00Z-2",
      createdAt: "2026-10-23T14:05:00.200Z",
      bookmarks: 2,
      folders: 1,
      operations: 0,
    });
    expect(list[0]).toMatchObject({ bookmarks: 0, folders: 0, operations: 1 });
  });

  it("lists nothing when no backup has been written", async () => {
    expect(await store().list()).toEqual([]);
  });

  it("reads one backup by its ID", async () => {
    const backups = store("2026-10-23T14:05:00.123Z");
    const written = await backups.write({ version: "0.1.0", revision: "0123456789abcdef", tree: TREE, plan: PLAN });

    expect(await backups.read("2026-10-23T14-05-00Z")).toEqual(written);
  });

  it("says a backup does not exist for an unknown ID, and for one that is not a backup's name", async () => {
    const backups = store("2026-10-23T14:05:00.123Z");
    await backups.write({ version: "0.1.0", revision: "0123456789abcdef", tree: TREE, plan: PLAN });
    await writeFile(join(folder, "secret.json"), JSON.stringify({ formatVersion: 1 }));

    for (const id of ["2026-10-23T14-05-01Z", "../secret", "2026-10-23T14-05-00Z/../../secret"]) {
      await expect(backups.read(id)).rejects.toThrow(`Backup ${id} does not exist.`);
    }
  });
});
