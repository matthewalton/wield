# OTEL rollout — Claude Code usage telemetry

**Status:** draft config, blocked on [consent](../../docs/consent.md) and backend sign-off ([ADR-0001](../../docs/adr/0001-otlp-backend.md)). Do not deploy before both land.

This directory holds the managed-settings payload that enables Claude Code's native OpenTelemetry export team-wide. Managed settings have the highest precedence — individual user/project settings cannot override them.

## What gets captured

Verified against [the monitoring docs](https://code.claude.com/docs/en/monitoring-usage) on 2026-07-10:

- **`claude_code.skill_activated` events** (added in Claude Code v2.1.126) — the core signal for the dashboard join. Attributes: `skill.name`, `invocation_trigger` (`user-slash` / `claude-proactive` / `nested-skill`), `skill.source` (`bundled` / `userSettings` / `projectSettings` / `plugin`), `plugin.name` when applicable.
- **Cost & token metrics** — `claude_code.cost.usage` and `claude_code.token.usage`, dimensioned by `skill.name`, `agent.name`, `plugin.name`, model.
- **Attribution** — `user.id`, `user.email`, `organization.id`, `session.id` on metrics/events.
- Session/productivity metrics (`claude_code.session.count`, `lines_of_code.count`, etc.) come along for free.

### skill.name masking — the design risk (updated 2026-07-10 after live testing)

`skill.name` is masked differently on events vs metrics; this was confirmed empirically (a personal skill arrived as `custom_skill`) and then in the docs fine print:

| Signal                   | Built-in / bundled / official marketplace | User-defined (incl. our skills)                       | Third-party plugin           |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------- | ---------------------------- |
| `skill_activated` events | verbatim                                  | **`"custom_skill"`** unless `OTEL_LOG_TOOL_DETAILS=1` | `"custom_skill"` (same rule) |
| cost/token metrics       | verbatim                                  | **verbatim — verified live 2026-07-10**               | `"third-party"`              |

Implications for the dashboard join:

- **Confirmed on the live pipeline (2026-07-10): metrics carry user-defined skill names verbatim.** The dashboard join therefore runs on **metrics** (per-skill cost/tokens/activity); events add invocation-trigger detail but mask custom skill names.
- Getting verbatim names on **events** requires `OTEL_LOG_TOOL_DETAILS=1`, which also exports tool parameters — conflicting with the privacy commitment below. With direct export there is nothing in the path to strip tool params while keeping skill names; a small team collector doing attribute filtering would resolve this (revisits ADR-0001's "no collector" choice).
- Whether project skills (`skill.source=projectSettings`) are masked like user skills on events is **not documented** — test empirically before the team rollout.

Also: user-defined agent names are masked to `"custom"` on metrics.

## What is deliberately NOT captured

Prompt content, code, and tool inputs/outputs are excluded by default. The opt-in vars (`OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_TOOL_DETAILS`) must stay **unset** — this is a commitment made in the consent agreement, not just a default.

**Known tension:** `OTEL_LOG_TOOL_DETAILS=1` is also the only switch that unmasks real skill names on events (see masking table above). If the team ever needs that, it must go through the consent conversation explicitly, ideally paired with a collector that strips `tool_parameters` before storage.

## Deploying `managed-settings.json`

Fill in the two `REPLACE_ME` values (backend endpoint + auth header; see ADR-0001), then place the file at:

| OS      | Path                                                                            |
| ------- | ------------------------------------------------------------------------------- |
| macOS   | `/Library/Application Support/ClaudeCode/managed-settings.json`                 |
| Linux   | `/etc/claude-code/managed-settings.json`                                        |
| Windows | see docs — the exact path is not consistently documented; verify before rollout |

> The docs don't publish a complete per-OS path matrix — re-verify against the [settings docs](https://code.claude.com/docs/en/settings) at deploy time.

For a small team without MDM, "deployment" is each person copying the file into place once (needs sudo on macOS/Linux); document it in onboarding.

## Verifying it works

1. Restart Claude Code, run any skill (e.g. a `/` command).
   - Gotcha (hit during the 2026-07-10 personal test): the Grafana Cloud `Authorization=Basic` value must be base64 of `instanceID:token` — encoding the `glc_` token alone fails auth **silently** and nothing ever arrives.
   - Gotcha #2 (same test, confirmed by capturing raw OTLP payloads): Claude Code exports counters with **delta temporality** by default, and Grafana's Mimir **silently drops** delta sums — you get `target_info` and logs but zero `claude_code_*` metrics. `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=cumulative` (now in the config) fixes it; Claude Code honors the standard OTel var.
2. Within ~1 min (`OTEL_METRIC_EXPORT_INTERVAL` default 60s; logs default 5s) the backend should show `claude_code.skill_activated` log events and `claude_code.*` metrics.
3. Check that `user.email` and `skill.name` appear on the data — that's the pair the dashboard joins on.
