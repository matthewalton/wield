import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { MetadataMap } from "./format.ts";

const CLI = fileURLToPath(new URL("./cli.ts", import.meta.url));

function run(
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ code: code ?? -1, stdout, stderr });
    });
  });
}

const parseMap = (text: string): MetadataMap => JSON.parse(text) as MetadataMap;

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

test("[SCAN-24] prints the metadata map as pretty JSON with a trailing newline by default", async () => {
  const dir = await root({
    planner: { meta: "category: plan\n", skillMd: frontmatter("planner") },
  });
  const { code, stdout } = await run(["--root", dir]);
  assert.equal(code, 0);
  const map = parseMap(stdout);
  assert.equal(map.version, 1);
  assert.deepEqual(Object.keys(map.skills), ["planner"]);
  assert.equal(stdout, `${JSON.stringify(map, null, 2)}\n`);
});

test("[SCAN-25] --format prom prints info metrics, with rendering diagnostics on stderr", async () => {
  const dir = await root({
    planner: { meta: "forked-from: grill-me\n", skillMd: frontmatter("planner") },
  });
  const { code, stdout, stderr } = await run(["--root", dir, "--format", "prom"]);
  assert.equal(code, 0);
  assert.ok(stdout.startsWith("# HELP skill_meta"));
  assert.ok(stdout.includes('skill_meta{skill_name="planner",forked_from="grill-me"} 1'));
  assert.match(stderr, /not a valid Prometheus label name/);
});

test("[SCAN-26] an unrecognised --format exits 2 with the complaint on stderr", async () => {
  const { code, stdout, stderr } = await run(["--format", "xml"]);
  assert.equal(code, 2);
  assert.equal(stdout, "");
  assert.match(stderr, /unknown --format "xml"/);
});

test("[SCAN-27] diagnostics are written to stderr as level: file: message lines", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wield-"));
  const { stderr } = await run(["--root", dir]);
  assert.match(stderr, /^warn: .+: no skills directory here/);
});

test("[SCAN-28] an error diagnostic makes the exit code 1, with the map still written first", async () => {
  const dir = await root({ broken: { meta: "category: [plan\n", skillMd: frontmatter("broken") } });
  const { code, stdout, stderr } = await run(["--root", dir]);
  assert.equal(code, 1);
  assert.match(stderr, /^error: /m);
  assert.deepEqual(parseMap(stdout).skills, {});
});

test("[SCAN-29] --strict turns warnings alone into a failing exit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "wield-")); // warns: no skills directory
  assert.equal((await run(["--root", dir])).code, 0);
  assert.equal((await run(["--root", dir, "--strict"])).code, 1);
});

test("[SCAN-30] --out writes the output to a file, keeping diagnostics on stderr", async () => {
  const dir = await root({ planner: { meta: "", skillMd: frontmatter("planner") } });
  const noSkills = await mkdtemp(join(tmpdir(), "wield-"));
  const out = join(noSkills, "map.json");
  const { stdout, stderr } = await run(["--root", dir, "--root", noSkills, "--out", out]);
  assert.equal(stdout, "");
  assert.match(stderr, /no skills directory/);
  const map = parseMap(await readFile(out, "utf8"));
  assert.deepEqual(Object.keys(map.skills), ["planner"]);
});

test("[SCAN-31] --help prints usage and exits 0", async () => {
  const { code, stdout } = await run(["--help"]);
  assert.equal(code, 0);
  assert.match(stdout, /wield scan/);
  assert.match(stdout, /--format/);
});

test("[SCAN-32] the cwd is the default root, and --root replaces it rather than adding", async () => {
  const home = await root({ local: { meta: "", skillMd: frontmatter("local") } });
  const other = await root({ remote: { meta: "", skillMd: frontmatter("remote") } });

  const byDefault = parseMap((await run([], home)).stdout);
  assert.deepEqual(Object.keys(byDefault.skills), ["local"]);
  assert.equal(byDefault.roots.length, 1);

  const replaced = parseMap((await run(["--root", other], home)).stdout);
  assert.deepEqual(Object.keys(replaced.skills), ["remote"]);
});
