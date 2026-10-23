import { describe, expect, it } from "vitest";

import { Plan } from "./plan.js";

describe("Plan", () => {
  it("parses a plan that uses all four operations, keys included", () => {
    const plan = {
      revision: "0123456789abcdef",
      operations: [
        { op: "create", key: "$reference", parent: "2", title: "Reference" },
        { op: "create", parent: "$reference", title: "Example: a test site", url: "https://example.com/", index: 0 },
        { op: "move", node: "12", parent: "$reference", index: 1 },
        { op: "rename", node: "13", title: "Example Org: another test site" },
        { op: "remove", node: "14" },
      ],
    };

    expect(Plan.parse(plan)).toEqual(plan);
  });

  it("refuses an operation with an unknown op", () => {
    const result = Plan.safeParse({ revision: "0123456789abcdef", operations: [{ op: "delete", node: "14" }] });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([{ path: ["operations", 0, "op"] }]);
  });

  it("refuses an operation with a field it does not have", () => {
    const result = Plan.safeParse({
      revision: "0123456789abcdef",
      operations: [{ op: "move", node: "12", parent: "2", idx: 0 }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toMatchObject([{ code: "unrecognized_keys", keys: ["idx"] }]);
  });
});
