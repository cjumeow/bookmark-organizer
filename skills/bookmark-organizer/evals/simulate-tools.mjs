// Stands in for the Bookmark Organizer MCP server and for the web in the organizer skill's evaluations, which run
// before the server exists and must never touch real bookmarks or real sites. It follows docs/spec.md closely enough
// to judge a plan: get_tree with the outline, check_plan with the validation rules and the dry run, apply_plan with a
// backup, list_backups and get_restore_plan (from a restore plan written in the fixture). It is a test double, not
// the server: the real validation is built in mcp-server/.
//
// Usage, from a folder holding fixture.json:  node simulate-tools.mjs <tool> [argument]
//   help | get_tree [folderId] | check_plan <plan.json> | apply_plan <plan.json> | list_backups
//   get_restore_plan <backupId> | open <url>
// Every call is appended to tool-calls.log as one JSON line; the bookmark tree after apply_plan is kept in state.json.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync("fixture.json", "utf8"));
const state = existsSync("state.json")
  ? JSON.parse(readFileSync("state.json", "utf8"))
  : { tree: fixture.tree, backups: fixture.backups ?? [], nextId: 1000 };

const SPECIAL_NAMES = { "bookmarks-bar": "Bookmarks bar", other: "Other bookmarks", mobile: "Mobile bookmarks" };

const HELP = `Bookmark Organizer (simulated MCP server)

Server instructions:
  Bookmark Organizer reads and changes the person's Chrome bookmarks. Decide names and folders by the
  bookmark-organizer skill. Run check_plan and show the person its changes before apply_plan, and apply only after
  they agree.

Tools:
  get_tree [folderId]     Read-only. Returns { revision, tree } with the whole bookmark tree, or with folderId only
                          that folder. When the tree is too large it returns { revision, outline } instead: the
                          folders with how many bookmarks each holds directly; then read one folder at a time.
  check_plan <plan.json>  Read-only. Validates a plan against the current tree and returns its dry run:
                          { valid: true, summary, changes } or { valid: false, errors }.
  apply_plan <plan.json>  Changes bookmarks. Backs up the whole tree, then applies the plan.
                          Returns { backupId, applied, created, revision, failed? }.
  list_backups            Read-only. Lists backups, newest first.
  get_restore_plan <id>   Read-only. Returns { plan, skipped }: the plan that brings the tree back to that backup.

Plan (JSON):
  { "revision": string,             // from get_tree or get_restore_plan
    "operations": Operation[] }     // applied in order, as one whole
  Operation is one of:
    { "op": "create", "key"?: "$name", "parent": Ref, "title": string, "url"?: string, "index"?: number }
    { "op": "move", "node": Ref, "parent": Ref, "index"?: number }
    { "op": "rename", "node": Ref, "title": string }
    { "op": "remove", "node": Ref }
  Ref is a node ID ("123") or the key of a node an earlier create made ("$dev-tools"; lowercase, digits, hyphens).

Web access is simulated as well: open <url> fetches a site and prints its title, description and text.`;

function walk(nodes, visit, parent = null) {
  nodes.forEach((node, index) => {
    visit(node, parent, index);
    if (node.children) walk(node.children, visit, node);
  });
}

function revisionOf(tree) {
  const hash = createHash("sha256");
  walk(tree, (node, parent, index) => {
    hash.update(JSON.stringify([node.id, parent?.id ?? null, index, node.title, node.url ?? null]));
  });
  return hash.digest("hex").slice(0, 16);
}

function index(tree) {
  const nodes = new Map();
  walk(tree, (node, parent) => nodes.set(node.id, { node, parent }));
  return nodes;
}

function bothStorages(tree) {
  return new Set(tree.map((special) => Boolean(special.syncing))).size > 1;
}

function specialName(special, tree) {
  const name = SPECIAL_NAMES[special.folderType] ?? special.title;
  return bothStorages(tree) ? `${name} (${special.syncing ? "account" : "local"})` : name;
}

function pathOf(folder, nodes, tree) {
  const parts = [];
  for (let current = folder; current; current = nodes.get(current.id).parent) {
    parts.unshift(current.folderType ? specialName(current, tree) : current.title);
  }
  return parts.join("/");
}

function storageOf(node, nodes) {
  let current = node;
  while (nodes.get(current.id).parent) current = nodes.get(current.id).parent;
  return Boolean(current.syncing);
}

function contains(ancestor, node, nodes) {
  for (let current = node; current; current = nodes.get(current.id).parent) {
    if (current === ancestor) return true;
  }
  return false;
}

// Runs the plan on a copy of the tree, operation by operation, as docs/spec.md#validation describes.
function run(plan, tree) {
  const copy = structuredClone(tree);
  const nodes = index(copy);
  const keys = new Map();
  const definedKeys = new Set();
  const errors = [];
  const changes = [];
  const created = {};
  const summary = { foldersCreated: 0, bookmarksCreated: 0, moved: 0, renamed: 0, removed: 0 };

  if (!Array.isArray(plan.operations)) {
    errors.push({ operation: -1, message: "The plan has no operations list." });
  }
  if (plan.revision !== revisionOf(tree)) {
    errors.push({ operation: -1, message: "The bookmarks changed; call get_tree again and rewrite the plan." });
  }
  const resolve = (ref, i, role) => {
    const node = typeof ref === "string" && ref.startsWith("$") ? keys.get(ref) : nodes.get(ref)?.node;
    if (!node) errors.push({ operation: i, message: `${role} ${JSON.stringify(ref)} is not a node or a defined key` });
    return node;
  };
  const folderParent = (ref, i) => {
    const parent = resolve(ref, i, "parent");
    if (parent && !parent.children) {
      errors.push({ operation: i, message: `parent "${parent.title}" is a bookmark, not a folder` });
      return undefined;
    }
    return parent;
  };
  const notSpecial = (node, i) => {
    if (node?.folderType) errors.push({ operation: i, message: `"${node.title}" is a special folder` });
    return node && !node.folderType;
  };
  const indexOk = (op, parent, i) => {
    if (op.index === undefined) return true;
    const ok = Number.isInteger(op.index) && op.index >= 0 && op.index <= parent.children.length;
    if (!ok) errors.push({ operation: i, message: `index ${op.index} is outside "${parent.title}"` });
    return ok;
  };
  const titleOk = (title, i) => {
    const ok = typeof title === "string" && title.trim() !== "";
    if (!ok) errors.push({ operation: i, message: "a title is empty" });
    return ok;
  };
  // As chrome.bookmarks.move does, an index counts the node's old place when it moves later in its own folder.
  const place = (node, parent, i, oldIndex = -1) => {
    const at = i === undefined ? parent.children.length : oldIndex >= 0 && oldIndex < i ? i - 1 : i;
    parent.children.splice(at, 0, node);
  };

  (Array.isArray(plan.operations) ? plan.operations : []).forEach((op, i) => {
    const before = errors.length;
    if (op.op === "create") {
      const parent = folderParent(op.parent, i);
      titleOk(op.title, i);
      if (op.key !== undefined && (!/^\$[a-z0-9-]+$/.test(op.key) || definedKeys.has(op.key))) {
        errors.push({ operation: i, message: `key ${JSON.stringify(op.key)} is malformed or defined twice` });
      }
      if (op.key !== undefined) definedKeys.add(op.key);
      if (op.url !== undefined && !URL.canParse(op.url)) {
        errors.push({ operation: i, message: `"${op.url}" is not an absolute URL` });
      }
      if (!parent || !indexOk(op, parent, i) || errors.length > before) return;
      const node = { id: `${state.nextId++}`, title: op.title, ...(op.url ? { url: op.url } : { children: [] }) };
      place(node, parent, op.index);
      nodes.set(node.id, { node, parent });
      if (op.key) {
        keys.set(op.key, node);
        created[op.key] = node.id;
      }
      changes.push(`create ${op.url ? "bookmark" : "folder"} "${op.title}" in "${pathOf(parent, nodes, copy)}"`);
      summary[op.url ? "bookmarksCreated" : "foldersCreated"]++;
    } else if (op.op === "move") {
      const node = resolve(op.node, i, "node");
      const parent = folderParent(op.parent, i);
      if (!notSpecial(node, i) || !parent) return;
      if (node.children && contains(node, parent, nodes)) {
        errors.push({ operation: i, message: `"${node.title}" cannot move into itself or a folder inside it` });
        return;
      }
      if (storageOf(node, nodes) !== storageOf(parent, nodes)) {
        errors.push({
          operation: i,
          message: `"${node.title}" would move to another storage (between local and account storage)`,
        });
        return;
      }
      if (!indexOk(op, parent, i)) return;
      const from = nodes.get(node.id).parent;
      const oldIndex = from.children.indexOf(node);
      from.children.splice(oldIndex, 1);
      place(node, parent, op.index, from === parent ? oldIndex : -1);
      nodes.set(node.id, { node, parent });
      changes.push(`move "${node.title}" from "${pathOf(from, nodes, copy)}" to "${pathOf(parent, nodes, copy)}"`);
      summary.moved++;
    } else if (op.op === "rename") {
      const node = resolve(op.node, i, "node");
      if (!notSpecial(node, i) || !titleOk(op.title, i)) return;
      changes.push(`rename "${node.title}" to "${op.title}"`);
      node.title = op.title;
      summary.renamed++;
    } else if (op.op === "remove") {
      const node = resolve(op.node, i, "node");
      if (!notSpecial(node, i)) return;
      if (node.children?.length) {
        errors.push({ operation: i, message: `folder "${node.title}" is not empty` });
        return;
      }
      const from = nodes.get(node.id).parent;
      from.children.splice(from.children.indexOf(node), 1);
      nodes.delete(node.id);
      for (const [key, keyed] of keys) if (keyed === node) keys.delete(key);
      changes.push(`remove "${node.title}" from "${pathOf(from, nodes, copy)}"`);
      summary.removed++;
    } else {
      errors.push({ operation: i, message: `unknown op ${JSON.stringify(op.op)}` });
    }
  });
  return { errors, changes, summary, created, tree: copy };
}

function outline(nodes) {
  return nodes
    .filter((node) => node.children)
    .map(({ id, title, children, folderType, syncing }) => ({
      id,
      title,
      bookmarkCount: children.filter((child) => !child.children).length,
      children: outline(children),
      ...(folderType ? { folderType, syncing } : {}),
    }));
}

function readPlan(path) {
  if (!path || !existsSync(path)) throw new Error(`plan file ${JSON.stringify(path)} not found`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function call(tool, arg) {
  const revision = revisionOf(state.tree);
  switch (tool) {
    case "help":
      return HELP;
    case "get_tree": {
      if (arg) {
        const entry = index(state.tree).get(arg);
        if (!entry?.node.children) return { isError: true, text: `That folder (${arg}) does not exist.` };
        return { revision, tree: [entry.node] };
      }
      return fixture.outline ? { revision, outline: outline(state.tree) } : { revision, tree: state.tree };
    }
    case "check_plan": {
      const result = run(readPlan(arg), state.tree);
      return result.errors.length
        ? { valid: false, errors: result.errors }
        : { valid: true, summary: result.summary, changes: result.changes };
    }
    case "apply_plan": {
      const plan = readPlan(arg);
      const result = run(plan, state.tree);
      if (result.errors.length) return { valid: false, errors: result.errors };
      const id = `2026-10-23T14-${String(state.backups.length).padStart(2, "0")}-00Z`;
      let bookmarks = 0;
      let folders = 0;
      walk(state.tree, (node) => (node.url ? bookmarks++ : node.folderType || folders++));
      const createdAt = `2026-10-23T14:${String(state.backups.length).padStart(2, "0")}:00Z`;
      state.backups.unshift({ id, createdAt, bookmarks, folders, operations: plan.operations.length });
      state.tree = result.tree;
      writeFileSync("state.json", JSON.stringify(state, null, 2));
      return {
        backupId: id,
        applied: plan.operations.length,
        created: result.created,
        revision: revisionOf(state.tree),
      };
    }
    case "list_backups":
      return {
        backups: state.backups.map(({ id, createdAt, bookmarks, folders, operations }) => ({
          id,
          createdAt,
          bookmarks,
          folders,
          operations,
        })),
      };
    case "get_restore_plan": {
      const backup = state.backups.find((candidate) => candidate.id === arg);
      if (!backup) return { isError: true, text: `That backup (${arg}) does not exist.` };
      // Computing a restore plan is the MCP server's work; the simulation only has the ones written in the fixture.
      if (!backup.restore) return { isError: true, text: `The simulation has no restore plan for backup ${arg}.` };
      return { plan: { revision, operations: backup.restore.operations }, skipped: backup.restore.skipped };
    }
    case "open": {
      const site = fixture.sites?.[arg] ?? fixture.sites?.[arg?.replace(/\/$/, "")] ?? fixture.sites?.[`${arg}/`];
      if (!site) return `GET ${arg}\nHTTP 404 Not Found\n\nThe requested URL was not found on this server.`;
      return (
        `GET ${arg}\nHTTP ${site.status ?? 200}\nTitle: ${site.title}\n` +
        (site.description ? `Meta description: ${site.description}\n` : "") +
        `\n${site.text ?? ""}`
      );
    }
    default:
      return { isError: true, text: `Unknown tool ${JSON.stringify(tool)}. Run: node simulate-tools.mjs help` };
  }
}

const [tool, arg] = process.argv.slice(2);
let output;
try {
  output = call(tool, arg);
} catch (error) {
  output = { isError: true, text: String(error.message) };
}
const logged = tool === "check_plan" || tool === "apply_plan" ? safePlan(arg) : arg;
appendFileSync("tool-calls.log", JSON.stringify({ tool, arg: logged, output }) + "\n");
console.log(typeof output === "string" ? output : JSON.stringify(output, null, 2));

function safePlan(path) {
  try {
    return readPlan(path);
  } catch {
    return path;
  }
}
