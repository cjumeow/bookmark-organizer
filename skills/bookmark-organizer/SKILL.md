---
name: bookmark-organizer
description: 'Rename and file a person''s Chrome bookmarks with the Bookmark Organizer tools (get_tree, check_plan, apply_plan, list_backups, get_restore_plan): every bookmark named "Name: short description", unclear sites opened and read rather than guessed, clear folders plus one catch-all folder, duplicates removed, nothing moved between local and account storage, and every change shown to the person and agreed before it is applied. Use whenever the person asks to organize, sort, clean up, tidy, rename, deduplicate or re-file their bookmarks or a bookmark folder, or to undo or restore a reorganization, even when they do not name the tools.'
---

# Organize bookmarks

You decide what each bookmark is called and where it goes; the Bookmark Organizer tools carry the decision out
exactly. The tools never judge anything, so the quality of the result is the quality of your judgment here. The
person trusts you with something personal and easy to break: a bookmark list is years of their reading, and they will
look for things by the names you give them.

The terms below are the product's: a **bookmark** points to a **site**; a **folder** holds nodes; the **special
folders** (Bookmarks bar, Other bookmarks, Mobile bookmarks) are Chrome's own and cannot be renamed, moved or removed;
a **plan** is the ordered list of operations you write; `check_plan` gives its **dry run**.

## The flow

1. **Read the tree.** Call `get_tree`. Keep its `revision`: the plan must carry it. If it returns an `outline`
   instead of a `tree`, the tree is too large to read at once; call `get_tree` with `folderId` for each folder you
   need, one at a time. Work only on what the person asked about: "my Read later folder" means that folder and
   nothing outside it.
2. **Find out what each bookmark is.** Decide from the title and URL when they make it clear; open the site when
   they do not (see [Checking sites](#checking-sites)).
3. **Decide** names, folders and duplicates by the rules below.
4. **Write the plan** and call `check_plan`. If it is not valid, fix what each error names and check again.
5. **Show the person the changes** and ask whether to apply them (see [Showing the plan](#showing-the-plan)). Then
   stop and wait for their answer.
6. **Apply only after they agree.** Call `apply_plan` with the plan you showed, unchanged. Agreement means a clear yes
   to these changes; a new wish ("but keep the Work folder") means a new plan, checked and shown again. If the person
   asked for changes and never saw them, they did not agree.
7. **Report the result**, and keep the `backupId` it returns in the report. If the result has `failed`, the
   operations before it stayed applied: say which operation failed and why, how many were applied, and offer to
   restore the backup (see [Restoring](#restoring)).

If `check_plan` or `apply_plan` says the bookmarks changed, the person edited them meanwhile: read the tree again and
rewrite the plan; never reuse an old plan on a new tree.

If the Bookmark Organizer tools are not available, say so and stop: Chrome must be open with the extension turned on,
and the MCP server registered. Never edit Chrome's `Bookmarks` file or drive the browser instead; those bypass the
check, the backup and the restore.

## Naming

Every bookmark you organize is renamed `Name: short description`.

- **Name** is the site's English name when it has one, taken from its English title, its logo or its domain, and
  written the way the site writes it: `GitHub`, `MDN`, `Stovetop`, not `github.com` or `GITHUB`. A site with no
  English name keeps its own name in its original language and script, neither translated nor romanized: `老王書房`,
  not `Lao Wang's Study` or `Laowang Shufang`. For a bookmark deep inside a site, the Name is still the site's; the
  description says which part.
- **Short description** is always in English, whatever language the person writes to you in or the site is in, so
  every title in the tree reads the same way. It says what this bookmark is for, in as few words as tell it apart from
  the others: usually two to five. Start lowercase unless it begins with a name, no trailing period, no tagline or
  marketing ("the best..."). Do not repeat the Name in it.
- One colon and one space between them. This rule is for titles only: talk to the person in their own language.
- A title that already follows the rule and says the right thing stays as it is: do not rename for its own sake.

| URL | Title before | Title after |
|---|---|---|
| `https://tint.example.com/` | `colors` | `Tintbox: color palette generator` |
| `https://ferrite.example.com/docs/api` | `API Reference - Ferrite \| The fastest...` | `Ferrite: API reference` |
| `https://stovetop.example.com/curry/chickpea` | `Recipe` | `Stovetop: chickpea curry` |
| `https://drillbook.example.com/regex` | `https://drillbook.example.com/regex` | `Drillbook: regex exercises` |
| `https://shufang.example.com/reviews` | `書評` | `老王書房: book reviews` |

## Checking sites

Never guess what a site is. A name and description you made up look as trustworthy as a real one, and the person
will rely on them.

- **When the title and URL leave the purpose unclear, open the site** and read its title, description and headings.
  Unclear means: the title is a URL, empty or generic (`Untitled`, `Home`, `Docs`, `Login`, `link`), or neither the
  title nor the domain says what the site is. With many bookmarks, open only those, not every site.
- **A site that cannot be opened is reported, never worked around.** A CAPTCHA, a login wall, a paywall, an error or
  a dead address means you do not know what the site is. Do not try another user agent, a cached copy, an archive, or
  the person's browser session to get past it. Leave that bookmark's title as it is, keep it out of the category
  folders (you do not know that it belongs there): leave it where it is if that folder stays as it was, and otherwise
  put it in the catch-all folder. List it for the person with what you saw ("asks for a CAPTCHA", "sign-in page
  only", "404"), so they can tell you what it is.
- **Do not open a URL that acts when opened**: unsubscribe, log-out, confirm or one-time sign-in URLs, and anything
  with a token in it. Opening it could unsubscribe the person or use up the URL. Do not open anything on this computer
  or the person's own network either: `localhost` and `127.0.0.1`, private addresses such as `10.*`, `172.16.*` to
  `172.31.*` and `192.168.*`, names like `router.local` or a bare intranet host, and `file:` or `chrome:` URLs; opening
  one can change a router or a home server. Judge these from the URL alone, and list them for the person with what
  they appear to be (an unsubscribe bookmark is usually stale and worth offering to remove, not
  removing on your own).

## Folders

- **Make folders for clear categories that hold enough bookmarks to be worth a folder: three or more.** A person
  scanning ten well-named folders finds things; a person scanning thirty folders of one or two bookmarks does not.
  Name a folder with a short plain noun the person would look for (`Cooking`, `Design`, `Programming`), in their
  language.
- **What fits no folder goes into one catch-all folder.** Never call it `Other`, `Others` or anything with "Other" in
  it: Chrome already has "Other bookmarks", and the two would be confused. Call it `Assorted` (or the person's word
  for it), and if a folder already plays that role, reuse it instead of making a second one.
- **Reuse a fitting folder** the person already has rather than creating a twin; rename a vague one (`stuff`,
  `New folder`) to say what it holds. Remove a folder the plan leaves empty.
- **Keep it shallow.** One level of category folders first; add subfolders to a category only when it grows past
  about twenty bookmarks and splits cleanly. When the person asks you to organize one folder, that folder is the top
  level: its categories become folders inside it, by the same rules. Keep a structure the person clearly built on
  purpose unless they ask you to change it.
- **Leave the special folders' roles alone.** Put new folders inside the special folder the bookmarks already live
  in. Bookmarks placed directly on the Bookmarks bar are the person's daily shortcuts: rename them, but leave them on
  the bar unless the person asks.

[`references/folder-taxonomy.md`](references/folder-taxonomy.md) has an example set of folders and what goes in each.
Read it when you are unsure how to group a mixed tree; adapt it to the person's bookmarks rather than forcing them
into it.

## Duplicates

Bookmarks are duplicates when their URLs are the same after ignoring the scheme (`http`/`https`), a leading `www.`,
a trailing slash and the `#fragment`. Keep one copy, the one in the best place (on the Bookmarks bar, or already in
the right folder), give it the right name, and remove the others. Pages of the same site with different paths are not
duplicates. Tell the person which duplicates you removed.

## Storage: never cross it

A profile can keep bookmarks in two storages: local storage, on this computer only, and account storage, saved to the
person's Google Account and shown on their other devices. Each storage has its own special folders: in `get_tree`, a
special folder with `syncing: true` is account storage, `syncing: false` local. Every node belongs to the storage of
the special folder it is in.

Never move a node from one storage to the other. Doing so would upload a local bookmark to the person's account or
take an account bookmark off their other devices: a choice the person makes in Chrome, not a side effect of tidying.
`check_plan` refuses such a move, but plan so it never happens:

- Organize each storage on its own. The same category in both storages becomes a folder in each, and each storage
  that has leftovers gets its own catch-all folder.
- When the person asks for something that would cross storages ("put all my programming bookmarks in one folder"),
  do what you can within each storage and tell them why the two are kept apart; moving bookmarks between storages is
  something they do in Chrome.
- The same URL in both storages is not a duplicate to remove: tell the person and let them choose.

## Writing the plan

A plan is `{ "revision": "...", "operations": [...] }`. The operations run in order on the tree as it is at that
point:

```json
{
  "revision": "3f9a0c1b2d4e5f60",
  "operations": [
    { "op": "create", "key": "$design", "parent": "2", "title": "Design" },
    { "op": "move", "node": "23", "parent": "$design" },
    { "op": "rename", "node": "23", "title": "Tintbox: color palette generator" },
    { "op": "rename", "node": "10", "title": "Cooking" },
    { "op": "remove", "node": "27" },
    { "op": "remove", "node": "11" }
  ]
}
```

- `create` without a `url` makes a folder; you only ever create folders. Give it a `key` (`$` and lowercase letters,
  digits, hyphens) to refer to it in later operations.
- `move` puts a node into `parent`, at `index` or last. `rename` changes a title. No operation changes a URL.
- `remove` removes a bookmark, or a folder that is already empty at that point: move or remove its contents first.
- Order: create folders, then move and rename, then remove duplicates and the folders left empty.

## Showing the plan

Show the person what `check_plan` returned, in words they can check, before asking anything:

1. The summary: how many folders created, bookmarks moved, renamed and removed.
2. The resulting folders, each with its bookmarks' new names, so they see the result rather than only the steps.
3. The `changes` lines from the dry run. When there are many, give them after the overview, grouped by folder, but
   never leave any out.
4. What you could not check, and why; duplicates you removed; anything you left alone on purpose (a storage you kept
   apart, sites you did not open).

Then ask whether to apply it, and wait.

## Restoring

When the person wants the tree as it was before a reorganization, or `apply_plan` failed partway:

1. `list_backups` lists the backups, newest first. A backup is the tree *before* the plan applied after it, so to
   bring back the tree as it was before the last reorganization, pick the newest. If you are not sure which one they
   mean, show the dates and ask.
2. `get_restore_plan` with that `backupId` returns a plan and the nodes it cannot restore (`skipped`), each with a
   reason.
3. Check that plan with `check_plan` and show it like any other, including what is skipped and why, and that
   bookmarks added since the backup stay where they are. Apply it only after the person agrees. Restoring takes a
   backup too, so the tree as it was before the restore can be brought back as well.
