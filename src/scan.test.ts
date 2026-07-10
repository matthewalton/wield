import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { scan } from './scan.ts';

/** Build a throwaway root containing `.claude/skills/<folder>/…`. */
async function root(skills: Record<string, { meta?: string; skillMd?: string }>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wield-'));
  for (const [folder, files] of Object.entries(skills)) {
    const skillDir = join(dir, '.claude', 'skills', folder);
    await mkdir(skillDir, { recursive: true });
    if (files.meta !== undefined) await writeFile(join(skillDir, 'meta.yaml'), files.meta);
    if (files.skillMd !== undefined) await writeFile(join(skillDir, 'SKILL.md'), files.skillMd);
  }
  return dir;
}

const frontmatter = (name: string) => `---\nname: ${name}\ndescription: x\n---\n\n# ${name}\n`;

test('picks up sidecars and skips skills without one', async () => {
  const dir = await root({
    'ticket-planner': {
      meta: 'category: plan\nauthor: sarah\n',
      skillMd: frontmatter('ticket-planner'),
    },
    'grill-me': { skillMd: frontmatter('grill-me') },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills), ['ticket-planner']);
  assert.deepEqual(map.skills['ticket-planner']!.dimensions, { category: 'plan', author: 'sarah' });
  assert.equal(diagnostics.length, 0);
});

test('an empty sidecar makes a skill tracked with no dimensions', async () => {
  const dir = await root({ bare: { meta: '', skillMd: frontmatter('bare') } });
  const { map } = await scan([dir]);
  assert.deepEqual(map.skills['bare']!.dimensions, {});
});

test('the join key comes from SKILL.md, not the folder name', async () => {
  // Telemetry reports the declared name; joining on the folder would match nothing.
  const dir = await root({
    'ticket-planner': { meta: 'category: plan\n', skillMd: frontmatter('plan-tickets') },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills), ['plan-tickets']);
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0]!.message, /declares name "plan-tickets" but the folder is/);
});

test('falls back to the folder name when SKILL.md is missing, and warns', async () => {
  const dir = await root({ orphan: { meta: 'category: plan\n' } });
  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills), ['orphan']);
  assert.match(diagnostics[0]!.message, /no SKILL.md beside this sidecar/);
});

test('merges roots, and warns when one name has conflicting dimensions', async () => {
  const a = await root({ shared: { meta: 'category: plan\n', skillMd: frontmatter('shared') } });
  const b = await root({ shared: { meta: 'category: review\n', skillMd: frontmatter('shared') } });

  const { map, diagnostics } = await scan([a, b]);
  // Telemetry cannot tell the two apart, so the first root wins deterministically.
  assert.equal(map.skills['shared']!.dimensions.category, 'plan');
  assert.match(diagnostics[0]!.message, /usage cannot be attributed between them/);
});

test('an identical skill in two roots is not a conflict', async () => {
  const meta = 'category: plan\n';
  const a = await root({ shared: { meta, skillMd: frontmatter('shared') } });
  const b = await root({ shared: { meta, skillMd: frontmatter('shared') } });

  const { diagnostics } = await scan([a, b]);
  assert.equal(diagnostics.length, 0);
});

test('a root with no skills directory warns rather than failing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wield-'));
  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(map.skills, {});
  assert.match(diagnostics[0]!.message, /no skills directory/);
});

test('malformed YAML is reported without losing the other skills', async () => {
  const dir = await root({
    broken: { meta: 'category: [plan\n', skillMd: frontmatter('broken') },
    fine: { meta: 'category: review\n', skillMd: frontmatter('fine') },
  });

  const { map, diagnostics } = await scan([dir]);
  assert.deepEqual(Object.keys(map.skills), ['fine']);
  assert.equal(diagnostics.filter((d) => d.level === 'error').length, 1);
});
