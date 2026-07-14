/**
 * The doctor's plugin skills section (PLUGIN-18..20): which enabled plugins
 * will Claude Code mask to the literal `third-party` on cost/token metrics.
 * Pure — the CLI reads the settings file and prints; ADR-0006 excludes cli.ts
 * from mutation, so the logic lives here.
 */

export const MASKING_ISSUE_URL = "https://github.com/anthropics/claude-code/issues/77541";

// Skills from this marketplace report verbatim (PLUGIN-19); everything else masks.
const OFFICIAL_MARKETPLACE = "claude-plugins-official";

/**
 * The section's lines, from the settings file's raw text — `null` when the
 * file is missing or unreadable, which reads as no enabled plugins.
 */
export function maskedPluginsSection(settingsText: string | null): string[] {
  // Stryker disable next-line ConditionalExpression,BlockStatement: without
  // this branch, JSON.parse(null) parses to null and the property access below
  // throws into the same catch, returning the identical line — the explicit
  // branch only spares the reader the indirection.
  if (settingsText === null) {
    return ["  settings file missing or unreadable — cannot check enabled plugins"];
  }
  let enabledPlugins: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(settingsText) as { enabledPlugins?: Record<string, unknown> };
    enabledPlugins = parsed.enabledPlugins ?? {};
  } catch {
    return ["  settings file missing or unreadable — cannot check enabled plugins"];
  }

  const masked = Object.entries(enabledPlugins)
    .filter(([, enabled]) => enabled === true)
    .map(([ref]) => ref)
    .filter((ref) => ref.slice(ref.lastIndexOf("@") + 1) !== OFFICIAL_MARKETPLACE);

  if (masked.length === 0) return ["  none — no enabled non-official plugins"];
  return [
    ...masked.map((ref) => `  ${ref}: skills report as "third-party" on metrics`),
    `  masking has no opt-out — ${MASKING_ISSUE_URL}`,
  ];
}
