/**
 * The scanner: walks one or more roots for `.claude/skills/*\/meta.yaml` and
 * merges them into the metadata map (docs/CONTRACT.md). Layout-agnostic — a
 * monorepo is the single-root case, not a special case.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import {
  type Diagnostic,
  type Dimensions,
  type MetadataMap,
  type SkillEntry,
  validateDimensions,
} from './format.ts';

export interface ScanResult {
  map: MetadataMap;
  diagnostics: Diagnostic[];
}

const SKILLS_DIR = join('.claude', 'skills');

/**
 * Claude Code takes a skill's name from its SKILL.md frontmatter, and that is
 * what lands on `skill.name` in telemetry. The folder name is only a fallback:
 * if the two disagree, joining on the folder name silently matches nothing.
 */
async function skillNameFrom(skillMd: string, fallback: string): Promise<string | null> {
  let text: string;
  try {
    text = await readFile(skillMd, 'utf8');
  } catch {
    return null;
  }

  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return fallback;
  const end = lines.indexOf('---', 1);
  if (end === -1) return fallback;

  try {
    const frontmatter = parse(lines.slice(1, end).join('\n')) as unknown;
    if (frontmatter && typeof frontmatter === 'object' && !Array.isArray(frontmatter)) {
      const name = (frontmatter as Record<string, unknown>).name;
      if (typeof name === 'string' && name.trim() !== '') return name.trim();
    }
  } catch {
    // A malformed frontmatter block is Claude Code's problem, not ours.
  }
  return fallback;
}

async function readSidecar(
  file: string,
  folder: string,
  skillMd: string,
  diagnostics: Diagnostic[],
): Promise<{ name: string; dimensions: Dimensions } | null> {
  let raw: unknown;
  try {
    raw = parse(await readFile(file, 'utf8'));
  } catch (err) {
    diagnostics.push({
      level: 'error',
      file,
      message: `could not parse YAML: ${(err as Error).message}`,
    });
    return null;
  }

  const { dimensions, diagnostics: problems } = validateDimensions(raw, file);
  diagnostics.push(...problems);

  const declared = await skillNameFrom(skillMd, folder);
  if (declared === null) {
    diagnostics.push({
      level: 'warn',
      file,
      message: `no SKILL.md beside this sidecar — falling back to the folder name "${folder}", which may not be what telemetry reports`,
    });
    return { name: folder, dimensions };
  }
  if (declared !== folder) {
    diagnostics.push({
      level: 'warn',
      file,
      message: `SKILL.md declares name "${declared}" but the folder is "${folder}" — using "${declared}", since that is what telemetry reports`,
    });
  }
  return { name: declared, dimensions };
}

const sameDimensions = (a: Dimensions, b: Dimensions): boolean =>
  JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

export async function scan(roots: string[]): Promise<ScanResult> {
  const diagnostics: Diagnostic[] = [];
  const skills: Record<string, SkillEntry> = {};
  const absRoots = roots.map((r) => resolve(r));

  for (const root of absRoots) {
    const skillsDir = join(root, SKILLS_DIR);
    let entries;
    try {
      entries = await readdir(skillsDir, { withFileTypes: true });
    } catch {
      diagnostics.push({
        level: 'warn',
        file: skillsDir,
        message: 'no skills directory here — nothing to scan in this root',
      });
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = join(skillsDir, entry.name);
      const sidecar = join(folder, 'meta.yaml');

      // No sidecar means an untracked skill: still used, just carries no
      // dimensions. Its absence is a legitimate choice, not an omission.
      try {
        await readFile(sidecar);
      } catch {
        continue;
      }

      const result = await readSidecar(sidecar, entry.name, join(folder, 'SKILL.md'), diagnostics);
      if (result === null) continue;

      const source = relative(process.cwd(), sidecar);
      const existing = skills[result.name];
      if (existing) {
        // Telemetry only gives us `skill.name`, so two skills sharing one name
        // are indistinguishable downstream. First root wins, deterministically.
        if (!sameDimensions(existing.dimensions, result.dimensions)) {
          diagnostics.push({
            level: 'warn',
            file: source,
            message: `"${result.name}" is already defined by ${existing.source} with different dimensions — usage cannot be attributed between them; keeping the first`,
          });
        }
        continue;
      }
      skills[result.name] = { name: result.name, dimensions: result.dimensions, source };
    }
  }

  return {
    map: { version: 1, roots: absRoots, skills },
    diagnostics,
  };
}
