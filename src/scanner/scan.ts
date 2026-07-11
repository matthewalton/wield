/**
 * The scanner: walks `.claude/skills/*` in one or more roots, reads dimensions
 * from each skill's homes — the `metadata` field in SKILL.md frontmatter
 * (primary) or the `meta.yaml` sidecar (override) — and merges them into the
 * metadata map (docs/CONTRACT.md). Layout-agnostic — a monorepo is the
 * single-root case, not a special case.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parse } from "yaml";
import {
  type Diagnostic,
  type Dimensions,
  type MetadataMap,
  type SkillEntry,
  validateDimensions,
} from "./format.ts";

export interface ScanResult {
  map: MetadataMap;
  diagnostics: Diagnostic[];
}

const SKILLS_DIR = join(".claude", "skills");

interface Frontmatter {
  /**
   * Claude Code takes a skill's name from its SKILL.md frontmatter, and that
   * is what lands on `skill.name` in telemetry. Null when the frontmatter
   * declares no usable name — the folder name is the fallback then.
   */
  name: string | null;
  metadata: unknown;
  /** Whether the `metadata` key exists at all — its bare presence opts in. */
  hasMetadata: boolean;
}

const NO_FRONTMATTER: Frontmatter = { name: null, metadata: undefined, hasMetadata: false };

/** Null means no SKILL.md; a malformed frontmatter block is Claude Code's problem, not ours. */
async function readFrontmatter(skillMd: string): Promise<Frontmatter | null> {
  let text: string;
  try {
    text = await readFile(skillMd, "utf8");
  } catch {
    return null;
  }

  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return NO_FRONTMATTER;
  const end = lines.indexOf("---", 1);
  if (end === -1) return NO_FRONTMATTER;

  let parsed: unknown;
  try {
    parsed = parse(lines.slice(1, end).join("\n"));
  } catch {
    return NO_FRONTMATTER;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return NO_FRONTMATTER;

  const block = parsed as Record<string, unknown>;
  const name =
    typeof block.name === "string" && block.name.trim() !== "" ? block.name.trim() : null;
  return { name, metadata: block.metadata, hasMetadata: "metadata" in block };
}

/** Resolve the map key from the declared name, warning when the folder disagrees. */
function skillName(
  frontmatter: Frontmatter,
  folder: string,
  file: string,
  diagnostics: Diagnostic[],
): string {
  const declared = frontmatter.name ?? folder;
  if (declared !== folder) {
    diagnostics.push({
      level: "warn",
      file,
      message: `SKILL.md declares name "${declared}" but the folder is "${folder}" — using "${declared}", since that is what telemetry reports`,
    });
  }
  return declared;
}

async function readSidecar(
  file: string,
  folder: string,
  frontmatter: Frontmatter | null,
  diagnostics: Diagnostic[],
): Promise<{ name: string; dimensions: Dimensions } | null> {
  let raw: unknown;
  try {
    raw = parse(await readFile(file, "utf8"));
  } catch (err) {
    diagnostics.push({
      level: "error",
      file,
      message: `could not parse YAML: ${(err as Error).message}`,
    });
    return null;
  }

  const { dimensions, diagnostics: problems } = validateDimensions(raw, file);
  diagnostics.push(...problems);

  if (frontmatter === null) {
    diagnostics.push({
      level: "warn",
      file,
      message: `no SKILL.md beside this sidecar — falling back to the folder name "${folder}", which may not be what telemetry reports`,
    });
    return { name: folder, dimensions };
  }
  return { name: skillName(frontmatter, folder, file, diagnostics), dimensions };
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
        level: "warn",
        file: skillsDir,
        message: "no skills directory here — nothing to scan in this root",
      });
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folder = join(skillsDir, entry.name);
      const sidecar = join(folder, "meta.yaml");
      const skillMd = join(folder, "SKILL.md");

      const frontmatter = await readFrontmatter(skillMd);
      const hasSidecar = await readFile(sidecar).then(
        () => true,
        () => false,
      );

      // Neither home present means an untracked skill: still used, just
      // carrying no dimensions. A legitimate choice, not an omission.
      if (!hasSidecar && !frontmatter?.hasMetadata) continue;

      let result: { name: string; dimensions: Dimensions } | null;
      let from: string;
      if (hasSidecar) {
        if (frontmatter?.hasMetadata) {
          diagnostics.push({
            level: "warn",
            file: sidecar,
            message: `this sidecar overrides the frontmatter metadata in ${skillMd} wholesale — remove one of the two homes`,
          });
        }
        result = await readSidecar(sidecar, entry.name, frontmatter, diagnostics);
        from = sidecar;
      } else {
        const { dimensions, diagnostics: problems } = validateDimensions(
          frontmatter!.metadata,
          skillMd,
          "frontmatter metadata",
        );
        diagnostics.push(...problems);
        result = { name: skillName(frontmatter!, entry.name, skillMd, diagnostics), dimensions };
        from = skillMd;
      }
      if (result === null) continue;

      const source = relative(process.cwd(), from);
      const existing = skills[result.name];
      if (existing) {
        // Telemetry only gives us `skill.name`, so two skills sharing one name
        // are indistinguishable downstream. First root wins, deterministically.
        if (!sameDimensions(existing.dimensions, result.dimensions)) {
          diagnostics.push({
            level: "warn",
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
