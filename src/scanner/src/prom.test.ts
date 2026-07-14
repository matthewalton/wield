import assert from "node:assert/strict";
import { test } from "vitest";
import type { MetadataMap } from "./format.ts";
import { renderInfoMetrics } from "./prom.ts";

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

const seriesOf = (text: string, metric: string) =>
  text.split("\n").filter((l) => l.startsWith(metric));

test("[SCAN-15] scalars become labels on one skill_meta series per skill", () => {
  const { text, diagnostics } = renderInfoMetrics(
    mapOf({ "ticket-planner": { category: "plan", author: "sarah" } }),
  );
  assert.ok(
    text.includes('skill_meta{skill_name="ticket-planner",author="sarah",category="plan"} 1'),
  );
  // Valid keys render without any diagnostic.
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-14] every skill gets exactly one skill_meta series, so group_left stays safe", () => {
  // This is the whole reason category is scalar: a group_left join errors out
  // entirely if the right-hand side has two rows for one skill_name.
  const { text } = renderInfoMetrics(
    mapOf({ a: { category: "plan", tags: ["x", "y", "z"] }, b: {}, c: { tags: ["x"] } }),
  );
  const meta = seriesOf(text, "skill_meta{");
  assert.equal(meta.length, 3);
  assert.ok(meta.includes('skill_meta{skill_name="b"} 1'));
});

test("[SCAN-16] lists fan out to one skill_tag series per member, keyed by dimension", () => {
  const { text } = renderInfoMetrics(
    mapOf({ a: { tags: ["experimental", "slow"], invokes: ["grill-me"] } }),
  );
  assert.deepEqual(seriesOf(text, "skill_tag{"), [
    'skill_tag{skill_name="a",key="invokes",value="grill-me"} 1',
    'skill_tag{skill_name="a",key="tags",value="experimental"} 1',
    'skill_tag{skill_name="a",key="tags",value="slow"} 1',
  ]);
});

test("[SCAN-17] list values never appear as skill_meta labels", () => {
  const { text } = renderInfoMetrics(mapOf({ a: { tags: ["x", "y"] } }));
  assert.deepEqual(seriesOf(text, "skill_meta{"), ['skill_meta{skill_name="a"} 1']);
});

test("[SCAN-18] the skill_tag metric is omitted entirely when nothing is set-valued", () => {
  const { text } = renderInfoMetrics(mapOf({ a: { category: "plan" } }));
  assert.ok(!text.includes("skill_tag"));
});

test("[SCAN-19] dimension keys that are not valid label names are sanitized, with a warning", () => {
  const { text, diagnostics } = renderInfoMetrics(mapOf({ a: { "forked-from": "grill-me" } }));
  assert.ok(text.includes('forked_from="grill-me"'));
  assert.equal(diagnostics[0]!.level, "warn");
  assert.match(diagnostics[0]!.message, /not a valid Prometheus label name/);
});

test("[SCAN-19] a sanitized label that still fails the grammar is prefixed with an underscore", () => {
  const { text, diagnostics } = renderInfoMetrics(mapOf({ a: { "0-key": "x" } }));
  assert.ok(text.includes('_0_key="x"'));
  assert.equal(diagnostics.length, 1);
});

test("[SCAN-20] two keys that sanitize to the same label never emit a duplicate label", () => {
  // skill_meta{...,forked_from="x",forked_from="y"} is invalid exposition
  // format — Prometheus would reject the whole scrape.
  const { text, diagnostics } = renderInfoMetrics(
    mapOf({ a: { "forked-from": "x", forked_from: "y" } }),
  );
  assert.deepEqual(seriesOf(text, "skill_meta{"), ['skill_meta{skill_name="a",forked_from="x"} 1']);
  const collision = diagnostics.find((d) => d.message.includes("collides"));
  assert.equal(collision?.level, "warn");
});

test("[SCAN-21] a dimension colliding with a reserved label is dropped, with a warning", () => {
  const { text, diagnostics } = renderInfoMetrics(mapOf({ a: { skill_name: "impostor" } }));
  assert.deepEqual(seriesOf(text, "skill_meta{"), ['skill_meta{skill_name="a"} 1']);
  assert.equal(diagnostics[0]!.level, "warn");
  assert.match(diagnostics[0]!.message, /collides with the reserved label/);
});

test("[SCAN-21] key and value are reserved alongside skill_name", () => {
  const { text, diagnostics } = renderInfoMetrics(mapOf({ a: { key: "x", value: "y" } }));
  assert.deepEqual(seriesOf(text, "skill_meta{"), ['skill_meta{skill_name="a"} 1']);
  assert.equal(diagnostics.length, 2);
});

test("[SCAN-39] each metric is introduced by HELP and TYPE headers declaring a gauge", () => {
  const { text } = renderInfoMetrics(mapOf({ a: { category: "plan", tags: ["x"] } }));
  assert.match(text, /^# HELP skill_meta .+$/m);
  assert.match(text, /^# TYPE skill_meta gauge$/m);
  assert.match(text, /^# HELP skill_tag .+$/m);
  assert.match(text, /^# TYPE skill_tag gauge$/m);
});

test("[SCAN-22] quotes and backslashes in values are escaped", () => {
  const { text } = renderInfoMetrics(mapOf({ a: { author: 'sa"r\\ah' } }));
  assert.ok(text.includes('author="sa\\"r\\\\ah"'));
});

test("[SCAN-23] output is deterministic — skills and labels are sorted", () => {
  const one = renderInfoMetrics(mapOf({ b: { z: "1", a: "2" }, a: { category: "plan" } })).text;
  const two = renderInfoMetrics(mapOf({ a: { category: "plan" }, b: { a: "2", z: "1" } })).text;
  assert.equal(one, two);
});
