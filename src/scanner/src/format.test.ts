import assert from "node:assert/strict";
import { test } from "vitest";
import { validateDimensions } from "./format.ts";

test("[SCAN-9] accepts strings and lists of strings", () => {
  const { dimensions, diagnostics } = validateDimensions(
    { category: "plan", tags: ["experimental", "slow"] },
    "SKILL.md",
  );
  assert.deepEqual(dimensions, { category: "plan", tags: ["experimental", "slow"] });
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-34] an empty metadata field is valid and carries no dimensions", () => {
  // Presence is what opts a skill into enriched tracking, not content.
  for (const empty of [null, undefined]) {
    const { dimensions, diagnostics } = validateDimensions(empty, "SKILL.md");
    assert.deepEqual(dimensions, {});
    assert.equal(diagnostics.length, 0);
  }
});

test("[SCAN-10] rejects numbers, booleans and nested maps, keeping the valid keys", () => {
  const { dimensions, diagnostics } = validateDimensions(
    { category: "plan", cost: 3, stable: true, owner: { name: "sarah" } },
    "SKILL.md",
  );
  assert.deepEqual(dimensions, { category: "plan" });
  assert.equal(diagnostics.length, 3);
  assert.ok(diagnostics.every((d) => d.level === "error"));
});

test("[SCAN-11] rejects a list with a non-string member", () => {
  const { dimensions, diagnostics } = validateDimensions({ tags: ["plan", 7] }, "SKILL.md");
  assert.deepEqual(dimensions, {});
  assert.match(diagnostics[0]!.message, /every member must be a string/);
});

test("[SCAN-12] rejects a metadata field that is not a map", () => {
  const { diagnostics } = validateDimensions(["plan"], "SKILL.md");
  assert.match(diagnostics[0]!.message, /must be a key → value map/);
});

test("[SCAN-13] unknown keys are never errors", () => {
  const { dimensions, diagnostics } = validateDimensions({ whatever: "yes" }, "SKILL.md");
  assert.deepEqual(dimensions, { whatever: "yes" });
  assert.equal(diagnostics.length, 0);
});
