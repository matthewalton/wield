import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

// The installable plugin files sit at the repo root — the platform fixes their
// location — but this slice owns them (decisions/0001).
const repoFile = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

async function manifest(): Promise<{ name: string; version: string; description: string }> {
  return JSON.parse(await readFile(repoFile(".claude-plugin/plugin.json"), "utf8")) as {
    name: string;
    version: string;
    description: string;
  };
}

test("[PLUGIN-1] the plugin manifest declares the plugin name wield", async () => {
  const parsed = await manifest();
  assert.equal(parsed.name, "wield");
  assert.ok(parsed.description.length > 0, "the manifest carries a description");
});

test("[PLUGIN-2] the manifest version equals the package.json version", async () => {
  const pkg = JSON.parse(await readFile(repoFile("package.json"), "utf8")) as { version: string };
  assert.equal((await manifest()).version, pkg.version);
});

const command = (name: string) => readFile(repoFile(`commands/${name}.md`), "utf8");

test("[PLUGIN-3] the scan command runs the scanner CLI from the plugin root", async () => {
  const body = await command("scan");
  assert.ok(body.includes("${CLAUDE_PLUGIN_ROOT}/src/scanner/src/cli.ts"));
});

test("[PLUGIN-4] the lint command runs the scanner CLI with --strict", async () => {
  const body = await command("lint");
  assert.ok(body.includes("${CLAUDE_PLUGIN_ROOT}/src/scanner/src/cli.ts"));
  assert.ok(body.includes("--strict"));
});

test("[PLUGIN-5] the push command runs the push CLI from the plugin root", async () => {
  const body = await command("push");
  assert.ok(body.includes("${CLAUDE_PLUGIN_ROOT}/src/push/src/cli.ts"));
});

test("[PLUGIN-6] the doctor command runs the doctor CLI from the plugin root", async () => {
  const body = await command("doctor");
  assert.ok(body.includes("${CLAUDE_PLUGIN_ROOT}/src/plugin/src/cli.ts"));
});

test("[PLUGIN-7] the init command scaffolds the metadata field in SKILL.md frontmatter, never a sidecar", async () => {
  const body = await command("init");
  assert.match(body, /SKILL\.md/);
  assert.match(body, /frontmatter/);
  assert.match(body, /`metadata:?`/);
  // Sidecar files were dropped entirely (docs/adr/0005): the command must not
  // steer anyone towards one.
  assert.doesNotMatch(body, /meta\.yaml|sidecar/i);
});

test("[PLUGIN-8] every plugin command carries a frontmatter description", async () => {
  const dir = repoFile("commands");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  assert.ok(files.length >= 5, "scan, lint, push, init, doctor at least");
  for (const file of files) {
    const body = await readFile(join(dir, file), "utf8");
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(body);
    assert.ok(frontmatter, `${file} opens with frontmatter`);
    const parsed = parse(frontmatter[1]!) as { description?: unknown };
    assert.ok(
      typeof parsed.description === "string" && parsed.description.length > 0,
      `${file} carries a description`,
    );
  }
});
