// The end-to-end tests: the built extension in Playwright's own Chromium, with a temporary profile, talking to the
// MCP server's bridge. Build first; see .claude/skills/verify/SKILL.md, "Driving the app".
//
//     npm run build && npm run test:e2e

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  // The bridge listens on one fixed port, so the tests take turns.
  workers: 1,
  fullyParallel: false,
  // The extension connects on its next alarm, up to 30 seconds after the bridge starts to listen.
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  // Evidence stays on this computer: artifacts/ is ignored by git.
  outputDir: "../artifacts/e2e",
});
