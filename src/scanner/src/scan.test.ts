import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { byFolderName, scan } from "./scan.ts";

/** Build a throwaway root containing `.claude/skills/<folder>/SKILL.md`. */
async function root(skills: Record<string, { skillMd?: string }>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wield-"));
  for (const [folder, files] of Object.entries(skills)) {
    const skillDir = join(dir, ".claude", "skills", folder);
    await mkdir(skillDir, { recursive: true });
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

test("[SCAN-37] a symlinked skill folder is walked like the folder itself", async () => {
  // The common personal setup: ~/.claude/skills/<name> links into a dotfiles
  // or agents directory elsewhere.
  const elsewhere = await mkdtemp(join(tmpdir(), "wield-real-"));
  const realSkill = join(elsewhere, "planner");
  await mkdir(realSkill, { recursive: true });
  await writeFile(join(realSkill, "SKILL.md"), tracked("planner", "  category: plan\n"));

  const dir = await mkdtemp(join(tmpdir(), "wield-"));
  const skillsDir = join(dir, ".claude", "skills");
  await mkdir(skillsDir, { recursive: true });
  await symlink(realSkill, join(skillsDir, "planner"));
  // A dangling symlink has no readable SKILL.md: skipped silently (SCAN-35).
  await symlink(join(elsewhere, "gone"), join(skillsDir, "gone"));

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills), ["planner"]);
  assert.deepEqual(map.skills.planner!.dimensions, { category: "plan" });
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-33] a metadata field outside a frontmatter block does not opt in", async () => {
  const dir = await root({
    // No opening delimiter: the later "---" is body text, not a block close.
    rule: { skillMd: "# rule\nmetadata: {}\n---\nbody\n" },
    // An opening delimiter that never closes is not a frontmatter block.
    unterminated: { skillMd: "---\nname: unterminated\nmetadata: {}\n# body\n" },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(map.skills, {});
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

test("[SCAN-35] a skill without frontmatter metadata is skipped without a diagnostic", async () => {
  const dir = await root({
    untracked: { skillMd: frontmatter("untracked") },
    empty: {},
    // Malformed frontmatter is Claude Code's problem, not the scanner's.
    broken: { skillMd: "---\nname: [broken\n---\n\n# broken\n" },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(map.skills, {});
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-35] frontmatter that parses to a scalar, a list, or nothing is skipped without a diagnostic", async () => {
  const dir = await root({
    scalar: { skillMd: "---\nplain string\n---\n\n# scalar\n" },
    list: { skillMd: "---\n- metadata\n---\n\n# list\n" },
    empty: { skillMd: "---\n\n---\n\n# empty\n" },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(map.skills, {});
  assert.equal(diagnostics.length, 0);
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

test("[SCAN-3] the join key comes from the declared name, not the folder name", async () => {
  // Telemetry reports the declared name; joining on the folder would match nothing.
  const dir = await root({
    "ticket-planner": { skillMd: tracked("plan-tickets", "  category: plan\n") },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills), ["plan-tickets"]);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0]!.level, "warn");
  assert.match(diagnostics[0]!.message, /declares name "plan-tickets" but the folder is/);
});

test("[SCAN-3] a frontmatter block with no usable name falls back to the folder silently", async () => {
  const dir = await root({
    blank: { skillMd: "---\nname: ''\nmetadata: {}\n---\n\n# blank\n" },
    spaces: { skillMd: '---\nname: "   "\nmetadata: {}\n---\n\n# spaces\n' },
    numeric: { skillMd: "---\nname: 42\nmetadata: {}\n---\n\n# numeric\n" },
    // Whitespace around the declared name is not a disagreement with the folder.
    padded: { skillMd: '---\nname: " padded "\nmetadata: {}\n---\n\n# padded\n' },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills).sort(), ["blank", "numeric", "padded", "spaces"]);
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-5] merges roots, and warns when one name has conflicting dimensions", async () => {
  const a = await root({ shared: { skillMd: tracked("shared", "  category: plan\n") } });
  const b = await root({ shared: { skillMd: tracked("shared", "  category: review\n") } });

  const { map, diagnostics } = await scan([a, b]);
  // Telemetry cannot tell the two apart, so the first root wins deterministically.
  assert.equal(map.skills.shared!.dimensions.category, "plan");
  assert.equal(diagnostics[0]!.level, "warn");
  assert.match(diagnostics[0]!.message, /usage cannot be attributed between them/);
});

test("[SCAN-38] within one root, the lexicographically first folder wins a duplicate name", async () => {
  // Folders created in reverse-lexicographic order: an unsorted readdir walk
  // (insertion order on many filesystems) would crown the wrong winner.
  const dir = await root({
    "zz-fork": { skillMd: tracked("shared", "  category: review\n") },
    "aa-original": { skillMd: tracked("shared", "  category: plan\n") },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.equal(map.skills.shared!.dimensions.category, "plan");
  assert.match(map.skills.shared!.source, /aa-original/);
  // Both folders also fire SCAN-3 name-mismatch warnings; pick out the dup one.
  const dup = diagnostics.find((d) => d.message.includes("usage cannot be attributed"));
  assert.ok(dup, "expected the duplicate-definition warning");
  assert.match(dup.file, /zz-fork/);
});

test("[SCAN-6] an identical skill in two roots is not a conflict", async () => {
  const skillMd = tracked("shared", "  category: plan\n");
  const a = await root({ shared: { skillMd } });
  const b = await root({ shared: { skillMd } });

  const { diagnostics } = await scan([a, b]);
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-6] identical dimensions in a different key order are identical", async () => {
  // Both insertion orders are unsorted, and differently so: comparing either
  // side unsorted against the other would look like a conflict.
  const a = await root({
    shared: { skillMd: tracked("shared", "  beta: x\n  alpha: y\n  gamma: z\n") },
  });
  const b = await root({
    shared: { skillMd: tracked("shared", "  gamma: z\n  alpha: y\n  beta: x\n") },
  });

  const { diagnostics } = await scan([a, b]);
  assert.equal(diagnostics.length, 0);
});

test("[SCAN-7] a root with no skills directory warns rather than failing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wield-"));
  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(map.skills, {});
  assert.equal(diagnostics[0]!.level, "warn");
  assert.match(diagnostics[0]!.message, /no skills directory/);
});

test("[SCAN-38] the folder-name comparator orders by name, byte-wise", () => {
  // readdir on APFS already returns name-ordered entries, so the walk cannot
  // exercise the sort here; the comparator is tested directly instead.
  assert.ok(byFolderName({ name: "aa-original" }, { name: "zz-fork" }) < 0);
  assert.ok(byFolderName({ name: "zz-fork" }, { name: "aa-original" }) > 0);
  assert.equal(byFolderName({ name: "same" }, { name: "same" }), 0);
  // Byte order, not locale order: "B" (0x42) sorts before "a" (0x61).
  assert.ok(byFolderName({ name: "B-fork" }, { name: "a-original" }) < 0);
});
