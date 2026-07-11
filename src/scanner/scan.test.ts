import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { scan } from "./scan.ts";

/** Build a throwaway root containing `.claude/skills/<folder>/…`. */
async function root(skills: Record<string, { meta?: string; skillMd?: string }>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wield-"));
  for (const [folder, files] of Object.entries(skills)) {
    const skillDir = join(dir, ".claude", "skills", folder);
    await mkdir(skillDir, { recursive: true });
    if (files.meta !== undefined) await writeFile(join(skillDir, "meta.yaml"), files.meta);
    if (files.skillMd !== undefined) await writeFile(join(skillDir, "SKILL.md"), files.skillMd);
  }
  return dir;
}

const frontmatter = (name: string) => `---\nname: ${name}\ndescription: x\n---\n\n# ${name}\n`;

/** SKILL.md whose frontmatter carries a `metadata` block (raw YAML, indented). */
const tracked = (name: string, metadata: string) =>
  `---\nname: ${name}\ndescription: x\nmetadata:\n${metadata}---\n\n# ${name}\n`;

test("[SCAN-33] frontmatter metadata opts a skill into the map", async () => {
  const dir = await root({
    "pr-reviewer": {
      skillMd: tracked("pr-reviewer", "  category: review\n  tags: [experimental]\n"),
    },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills), ["pr-reviewer"]);
  assert.deepEqual(map.skills["pr-reviewer"]!.dimensions, {
    category: "review",
    tags: ["experimental"],
  });
  assert.match(map.skills["pr-reviewer"]!.source, /SKILL\.md$/);
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-34] an empty metadata field makes a skill tracked with no dimensions", async () => {
  const dir = await root({
    // `metadata:` with no value parses to null; `metadata: {}` to an empty map.
    bare: { skillMd: "---\nname: bare\ndescription: x\nmetadata:\n---\n\n# bare\n" },
    braces: { skillMd: "---\nname: braces\ndescription: x\nmetadata: {}\n---\n\n# braces\n" },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(map.skills.bare!.dimensions, {});
  assert.deepEqual(map.skills.braces!.dimensions, {});
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-35] a skill with neither home is skipped without a diagnostic", async () => {
  const dir = await root({
    untracked: { skillMd: frontmatter("untracked") },
    empty: {},
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(map.skills, {});
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-36] the sidecar replaces frontmatter metadata wholesale, with a warning", async () => {
  const dir = await root({
    both: {
      meta: "category: review\n",
      skillMd: tracked("both", "  category: plan\n  author: sarah\n"),
    },
  });

  const { map, diagnostics } = await scan([dir]);
  // No per-key merge: frontmatter's `author` is gone, not carried over.
  assert.deepEqual(map.skills.both!.dimensions, { category: "review" });
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]!.level, "warn");
  assert.match(diagnostics[0]!.message, /overrides the frontmatter metadata/);
  assert.match(diagnostics[0]!.message, /SKILL\.md/);
});

test("[SCAN-12] a non-map metadata field yields one error and a dimensionless entry", async () => {
  const dir = await root({
    odd: { skillMd: "---\nname: odd\ndescription: x\nmetadata: fast\n---\n\n# odd\n" },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(map.skills.odd!.dimensions, {});
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]!.level, "error");
  assert.match(
    diagnostics[0]!.message,
    /frontmatter metadata must be a key → value map, got a string/,
  );
});

test("[SCAN-1] picks up sidecars and skips skills without one", async () => {
  const dir = await root({
    "ticket-planner": {
      meta: "category: plan\nauthor: sarah\n",
      skillMd: frontmatter("ticket-planner"),
    },
    "grill-me": { skillMd: frontmatter("grill-me") },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills), ["ticket-planner"]);
  assert.deepEqual(map.skills["ticket-planner"]!.dimensions, { category: "plan", author: "sarah" });
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-2] an empty sidecar makes a skill tracked with no dimensions", async () => {
  const dir = await root({ bare: { meta: "", skillMd: frontmatter("bare") } });
  const { map } = await scan([dir]);
  assert.deepEqual(map.skills.bare!.dimensions, {});
});

test("[SCAN-3] the join key comes from SKILL.md, not the folder name", async () => {
  // Telemetry reports the declared name; joining on the folder would match nothing.
  const dir = await root({
    "ticket-planner": { meta: "category: plan\n", skillMd: frontmatter("plan-tickets") },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills), ["plan-tickets"]);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0]!.message, /declares name "plan-tickets" but the folder is/);
});

test("[SCAN-4] falls back to the folder name when SKILL.md is missing, and warns", async () => {
  const dir = await root({ orphan: { meta: "category: plan\n" } });
  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills), ["orphan"]);
  assert.match(diagnostics[0]!.message, /no SKILL.md beside this sidecar/);
});

test("[SCAN-5] merges roots, and warns when one name has conflicting dimensions", async () => {
  const a = await root({ shared: { meta: "category: plan\n", skillMd: frontmatter("shared") } });
  const b = await root({ shared: { meta: "category: review\n", skillMd: frontmatter("shared") } });

  const { map, diagnostics } = await scan([a, b]);
  // Telemetry cannot tell the two apart, so the first root wins deterministically.
  assert.equal(map.skills.shared!.dimensions.category, "plan");
  assert.match(diagnostics[0]!.message, /usage cannot be attributed between them/);
});

test("[SCAN-6] an identical skill in two roots is not a conflict", async () => {
  const meta = "category: plan\n";
  const a = await root({ shared: { meta, skillMd: frontmatter("shared") } });
  const b = await root({ shared: { meta, skillMd: frontmatter("shared") } });

  const { diagnostics } = await scan([a, b]);
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-7] a root with no skills directory warns rather than failing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wield-"));
  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(map.skills, {});
  assert.match(diagnostics[0]!.message, /no skills directory/);
});

test("[SCAN-8] malformed YAML is reported without losing the other skills", async () => {
  const dir = await root({
    broken: { meta: "category: [plan\n", skillMd: frontmatter("broken") },
    fine: { meta: "category: review\n", skillMd: frontmatter("fine") },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills), ["fine"]);
  assert.equal(diagnostics.filter((d) => d.level === "error").length, 1);
});
