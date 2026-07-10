/**
 * Phase 1 adapter: render the metadata map as Prometheus info metrics, the
 * `kube_pod_labels` / `target_info` pattern. Disposable scaffolding — the
 * durable artifact is the JSON map (ADR-0002).
 *
 * Scalars and sets are rendered as *different metrics*, because they answer
 * different questions:
 *
 *   skill_meta — exactly one series per skill, so it is safe on the one side of
 *     a `group_left` join. Group by it; the buckets partition and totals
 *     reconcile against the grand total.
 *
 *       sum by (skill_name) (rate(claude_code_token_usage_total[1h]))
 *         * on(skill_name) group_left(category) skill_meta
 *
 *   skill_tag — one series per (skill, key, value), so a skill appears many
 *     times. Filter by it with a set operator, which permits many-to-many
 *     matching. Do not group by it: a skill tagged `plan` and `review` counts
 *     fully in both, so the buckets overlap and will not sum to the total.
 *
 *       sum by (skill_name) (rate(claude_code_token_usage_total[1h]))
 *         and on(skill_name) skill_tag{key="tags", value="experimental"}
 */

import { type Diagnostic, type MetadataMap, isScalar } from './format.ts';

const VALID_LABEL = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const RESERVED = new Set(['skill_name', 'key', 'value']);

const escapeValue = (v: string): string =>
  v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');

const sanitizeLabelName = (key: string): string => {
  const cleaned = key.replace(/[^a-zA-Z0-9_]/g, '_');
  return VALID_LABEL.test(cleaned) ? cleaned : `_${cleaned}`;
};

const labels = (pairs: [string, string][]): string =>
  pairs.map(([k, v]) => `${k}="${escapeValue(v)}"`).join(',');

export function renderInfoMetrics(map: MetadataMap): {
  text: string;
  diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const metaLines: string[] = [];
  const tagLines: string[] = [];

  for (const name of Object.keys(map.skills).sort()) {
    const { dimensions, source } = map.skills[name]!;
    const scalars: [string, string][] = [];
    const usedLabels = new Set<string>();

    for (const key of Object.keys(dimensions).sort()) {
      const value = dimensions[key]!;
      const label = sanitizeLabelName(key);

      if (isScalar(value)) {
        if (usedLabels.has(label)) {
          diagnostics.push({
            level: 'warn',
            file: source,
            message: `dimension "${key}" collides with another dimension after sanitizing to "${label}" — omitted from skill_meta`,
          });
          continue;
        }
        if (RESERVED.has(label)) {
          diagnostics.push({
            level: 'warn',
            file: source,
            message: `dimension "${key}" collides with the reserved label "${label}" — omitted from skill_meta`,
          });
          continue;
        }
        if (label !== key) {
          diagnostics.push({
            level: 'warn',
            file: source,
            message: `dimension "${key}" is not a valid Prometheus label name — exported as "${label}"`,
          });
        }
        usedLabels.add(label);
        scalars.push([label, value]);
        continue;
      }

      // A set: one series per member, keyed by the dimension it came from so
      // `tags` and `invokes` stay distinguishable on one metric.
      for (const member of value) {
        tagLines.push(
          `skill_tag{${labels([
            ['skill_name', name],
            ['key', key],
            ['value', member],
          ])}} 1`,
        );
      }
    }

    // Always emit a skill_meta series, even with no scalars: it guarantees one
    // row per skill for `group_left` and makes tracked skills discoverable.
    metaLines.push(`skill_meta{${labels([['skill_name', name], ...scalars])}} 1`);
  }

  const out: string[] = [
    '# HELP skill_meta Scalar dimensions of a tracked skill. One series per skill; safe to group by.',
    '# TYPE skill_meta gauge',
    ...metaLines,
  ];
  if (tagLines.length > 0) {
    out.push(
      '# HELP skill_tag Set-valued dimensions of a tracked skill. Many series per skill; filter with `and on(skill_name)`, do not group by.',
      '# TYPE skill_tag gauge',
      ...tagLines,
    );
  }

  return { text: `${out.join('\n')}\n`, diagnostics };
}
