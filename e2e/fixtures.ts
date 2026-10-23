// Playwright fixtures for the end-to-end tests: Playwright's own Chromium with the built extension loaded, in a
// temporary profile that is removed afterwards. Never the developer's Chrome, profile or bookmarks.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { type BrowserContext, chromium, test as base, type Worker } from "@playwright/test";

const EXTENSION_DIR = fileURLToPath(new URL("../extension/dist", import.meta.url));

export const test = base.extend<{ context: BrowserContext; serviceWorker: Worker }>({
  // eslint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern.
  context: async ({}, use) => {
    const profileDir = await mkdtemp(join(tmpdir(), "bookmark-organizer-e2e-"));
    const context = await chromium.launchPersistentContext(profileDir, {
      // The full Chromium in its new headless mode, which loads extensions; the headless shell does not.
      channel: "chromium",
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    try {
      await use(context);
    } finally {
      await context.close();
      await rm(profileDir, { recursive: true, force: true });
    }
  },

  /** The extension's service worker, where `chrome.bookmarks` can be called directly. */
  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(worker);
  },
});

export { expect } from "@playwright/test";
