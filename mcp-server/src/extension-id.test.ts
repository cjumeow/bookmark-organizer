import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { EXTENSION_ID } from "@bookmark-organizer/shared";
import { expect, test } from "vitest";

// Chrome derives an extension's ID from its public key: the first 32 hexadecimal digits of the key's SHA-256, each
// written as a letter from a to p. The bridge accepts only that ID's Origin, so the two must agree.
test("EXTENSION_ID is the ID Chrome derives from the manifest's key", () => {
  const manifest = JSON.parse(readFileSync(new URL("../../extension/manifest.json", import.meta.url), "utf8")) as {
    key: string;
  };
  const digest = createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32);
  const id = digest.replace(/./g, (digit) => String.fromCharCode("a".charCodeAt(0) + parseInt(digit, 16)));

  expect(id).toBe(EXTENSION_ID);
});
