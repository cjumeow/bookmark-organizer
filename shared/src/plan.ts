// The plan the agent writes, from the spec's "Plan" section: docs/spec.md#plan. These schemas declare its shape only;
// the rules a plan must follow against the tree are validation's, not theirs. Objects are strict, so a misspelled
// field (`idx` for `index`) is refused instead of silently dropped.

import { z } from "zod";

export const Ref = z
  .string()
  .describe('A node\'s ID ("123"), or the key of a node an earlier operation in the plan creates ("$dev-tools")');
export type Ref = z.infer<typeof Ref>;

export const Operation = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("create"),
    key: z.string().optional(),
    parent: Ref,
    title: z.string(),
    url: z.string().optional(),
    index: z.int().optional(),
  }),
  z.strictObject({ op: z.literal("move"), node: Ref, parent: Ref, index: z.int().optional() }),
  z.strictObject({ op: z.literal("rename"), node: Ref, title: z.string() }),
  z.strictObject({ op: z.literal("remove"), node: Ref }),
]);
export type Operation = z.infer<typeof Operation>;

export const Plan = z.strictObject({
  revision: z.string().describe("From get_tree or get_restore_plan"),
  operations: z.array(Operation),
});
export type Plan = z.infer<typeof Plan>;
