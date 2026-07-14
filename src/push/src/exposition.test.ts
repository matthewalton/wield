import assert from "node:assert/strict";
import { test } from "vitest";
import type { MetadataMap } from "../../scanner/src/format.ts";
import { renderInfoMetrics } from "../../scanner/src/prom.ts";
import { parseExposition } from "./exposition.ts";

// In-process tests for the parse leg of the delivery: what the renderer emits
// is exactly what the push sends (decisions/0001), so the parser must read the
// renderer's output back without loss. The spawn-the-CLI tests in cli.test.ts
// keep the end-to-end view; mutants are only observable here (ADR-0006).

const mapOf = (skills: Record<string, Record<string, string | string[]>>): MetadataMap => ({
  version: 1,
  roots: ["/repo"],
  skills: Object.fromEntries(
    Object.entries(skills).map(([name, dimensions]) => [
      name,
      { name, dimensions, source: `${name}/SKILL.md` },
    ]),
  ),
});

test("[PUSH-1] parsing the rendered exposition returns every series the rendering emits", () => {
  const { text } = renderInfoMetrics(
    mapOf({ planner: { category: "plan", tags: ["experimental", "slow"] }, reviewer: {} }),
  );
  // Comment lines (# HELP / # TYPE) and the trailing blank line yield no
  // series; everything else comes back with name, labels in wire order, value.
  assert.deepEqual(parseExposition(text), [
    {
      name: "skill_meta",
      labels: [
        ["skill_name", "planner"],
        ["category", "plan"],
      ],
      value: 1,
    },
    { name: "skill_meta", labels: [["skill_name", "reviewer"]], value: 1 },
    {
      name: "skill_tag",
      labels: [
        ["skill_name", "planner"],
        ["key", "tags"],
        ["value", "experimental"],
      ],
      value: 1,
    },
    {
      name: "skill_tag",
      labels: [
        ["skill_name", "planner"],
        ["key", "tags"],
        ["value", "slow"],
      ],
      value: 1,
    },
  ]);
});

// Each rejection must say what was unreadable and quote the offending line —
// the drift alarm has to be diagnosable from the message alone.
const rejects = (text: string, saying: string) => {
  assert.throws(
    () => parseExposition(text),
    (error: Error) => error.message.includes(saying) && error.message.includes(text),
    `expected a rejection saying "${saying}"`,
  );
};

test("[PUSH-15] a series line without labels is rejected, quoting the line", () => {
  rejects("skill_meta 1", "series without labels");
});

test("[PUSH-15] an unterminated label value is rejected, quoting the line", () => {
  rejects('skill_meta{skill_name="oops 1', "unterminated label value");
});

test("[PUSH-15] a label without an = is rejected as malformed, quoting the line", () => {
  rejects("skill_meta{skill_name} 1", "malformed label");
  // Still malformed when the line opens with a quote — the rejection must
  // come from the label check, not from stumbling into the quote elsewhere.
  rejects('"m{skill_name} 1', "malformed label");
});

test("[PUSH-15] an unquoted label value is rejected as malformed, quoting the line", () => {
  rejects("skill_meta{skill_name=unquoted} 1", "malformed label");
});

test("[PUSH-15] an unreadable sample value is rejected, quoting the line", () => {
  rejects('skill_meta{skill_name="a"} x', "unreadable sample value");
});

test("[PUSH-1] escaped label values round-trip exactly — backslash, quote, newline", () => {
  const awkward = 'a\\b"c\nd';
  const { text } = renderInfoMetrics(mapOf({ s: { author: awkward } }));
  assert.deepEqual(parseExposition(text), [
    {
      name: "skill_meta",
      labels: [
        ["skill_name", "s"],
        ["author", awkward],
      ],
      value: 1,
    },
  ]);
});
