import { describe, expect, test } from "vitest";

import { isUpgradeAllowed } from "./upgrade.js";

const allowed = { origin: "chrome-extension://ancijliidboahicggjggbhlflehlnbjg", host: "127.0.0.1:47615" };

describe("isUpgradeAllowed", () => {
  test("allows the extension's Origin on the bridge's Host", () => {
    expect(
      isUpgradeAllowed(
        { origin: "chrome-extension://ancijliidboahicggjggbhlflehlnbjg", host: "127.0.0.1:47615" },
        allowed,
      ),
    ).toBe(true);
  });

  test.each([
    ["another extension", "chrome-extension://abcdefghijklmnopabcdefghijklmnop"],
    ["a page on http://localhost", "http://localhost:3000"],
    ["a page on http://127.0.0.1", "http://127.0.0.1:47615"],
    ["an opaque origin", "null"],
  ])("refuses the Origin of %s", (_, origin) => {
    expect(isUpgradeAllowed({ origin, host: "127.0.0.1:47615" }, allowed)).toBe(false);
  });

  test("refuses a request without an Origin", () => {
    expect(isUpgradeAllowed({ host: "127.0.0.1:47615" }, allowed)).toBe(false);
  });

  test.each([
    ["localhost", "localhost:47615"],
    ["another port", "127.0.0.1:8080"],
    ["a rebound domain name", "attacker.example.com:47615"],
  ])("refuses the Host of %s", (_, host) => {
    expect(isUpgradeAllowed({ origin: allowed.origin, host }, allowed)).toBe(false);
  });

  test("refuses a request without a Host", () => {
    expect(isUpgradeAllowed({ origin: allowed.origin }, allowed)).toBe(false);
  });
});
