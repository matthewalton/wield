/**
 * The `meta.yaml` sidecar format. See docs/FORMAT.md.
 *
 * The shape of a value declares how the dashboard may use it:
 * a scalar is a partition (groupable), a list is a set (filterable).
 */

export type DimensionValue = string | string[];
export type Dimensions = Record<string, DimensionValue>;

export interface SkillEntry {
  /** The name telemetry reports on `skill.name` — the join key. */
  name: string;
  dimensions: Dimensions;
  /** Path to the sidecar this entry came from. */
  source: string;
}

export interface MetadataMap {
  version: 1;
  roots: string[];
  skills: Record<string, SkillEntry>;
}

export interface Diagnostic {
  level: 'warn' | 'error';
  file: string;
  message: string;
}

export const isScalar = (v: DimensionValue): v is string => typeof v === 'string';
export const isSet = (v: DimensionValue): v is string[] => Array.isArray(v);

const describe = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a list';
  return `a ${typeof v}`;
};

/**
 * Validate a parsed sidecar against FORMAT.md's rules. No keys are required and
 * unknown keys are never errors, so every failure here is about value *shape*.
 * Bad values are dropped rather than fatal: one malformed key must not cost a
 * skill its place in the map.
 */
export function validateDimensions(
  raw: unknown,
  file: string,
): { dimensions: Dimensions; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const dimensions: Dimensions = {};

  // An empty sidecar parses to null. Its presence still opts the skill in.
  if (raw === null || raw === undefined) return { dimensions, diagnostics };

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    diagnostics.push({
      level: 'error',
      file,
      message: `sidecar must be a key → value map, got ${describe(raw)}`,
    });
    return { dimensions, diagnostics };
  }

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      dimensions[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const bad = value.filter((m) => typeof m !== 'string');
      if (bad.length > 0) {
        diagnostics.push({
          level: 'error',
          file,
          message: `"${key}" is a list but contains ${describe(bad[0])} — every member must be a string; dropping the key`,
        });
        continue;
      }
      dimensions[key] = value as string[];
      continue;
    }
    diagnostics.push({
      level: 'error',
      file,
      message: `"${key}" is ${describe(value)} — values must be a string or a list of strings; dropping the key`,
    });
  }

  return { dimensions, diagnostics };
}
