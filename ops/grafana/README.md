# Grafana — the Phase 1 dashboard

**Status:** v1 (2026-07-12) · **Ticket:** Baton #79 · **Decision:** [ADR-0002](../../docs/adr/0002-query-time-join.md)

[`skill-usage.dashboard.json`](skill-usage.dashboard.json) is the Phase 1 dashboard: disposable Grafana panels that join usage metrics against the `skill_meta` info metrics at query time. It is scaffolding by design — the product path (an app reading the JSON map) replaces it without ceremony.

## What it shows

| Row           | Panels                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------- |
| Overall usage | Tracked-skill count (map health), top skills by tokens and by cost — tracked or not         |
| By dimension  | Tokens by category (with an _(untracked)_ slice), tracked skills × category × tokens × cost |
| Per person    | Tokens by person × skill; person × category matrix (tracked skills only)                    |
| Trend         | Stacked tokens over time by skill; stacked cost over time by category                       |

Dashboard variables filter by person (`user_email`) and by category. Time range defaults to 7 days; the "top skills" and table panels aggregate over whatever range is selected.

## Prerequisites

1. Usage metrics flowing: the [OTEL rollout](../otel/README.md) — `claude_code_*` metrics with `skill_name` and `user_email` labels.
2. The metadata map pushed: the [delivery workflow](../../docs/delivery.md) landing `skill_meta{job="wield"}` — repo secrets set and the workflow run at least once. Until then the category/dimension panels are empty; the overall panels work on telemetry alone.

## Importing

Grafana → Dashboards → New → Import → upload the JSON (or paste it), then pick your Prometheus/Mimir data source in the `Data source` variable. Re-import with the same UID (`wield-skill-usage`) overwrites in place — treat the JSON in this repo as the source of truth and re-import after edits rather than editing live.

## If panels come up empty

- **Metric names.** The queries use `claude_code_token_usage_tokens_total` / `claude_code_cost_usage_USD_total` — Grafana Cloud's OTLP translation of `claude_code.token.usage` / `claude_code.cost.usage`, unit suffix included (confirmed live 2026-07-12). Other gateways may drop the unit suffix (`claude_code_token_usage_total`); check what your stack actually has with an Explore query of `{__name__=~"claude_code.*"}` and adjust the panel queries if the names differ.
- **Everything blank.** Grafana Cloud silently drops delta-temporality sums — the `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=cumulative` gotcha in [otel/README.md](../otel/README.md).
- **Category panels blank, overall panels fine.** The map isn't landing: check the delivery workflow and secrets ([docs/delivery.md](../../docs/delivery.md)), and that the daily re-push cron is running — panels look back `25h` for `skill_meta`.
- **"found duplicate series" error.** A join lost its `topk by (skill_name) (1, last_over_time(…))` wrapper — mandatory on the map side of every `group_left`, see [docs/delivery.md](../../docs/delivery.md#freshness-and-hygiene-read-before-writing-panels). Expected for up to a day after a skill's metadata changes _only_ if the wrapper is missing.

## Known limits (accepted for Phase 1)

- A tracked skill whose metadata carries no `category` joins with an empty category value and shows as a blank slice; file it under a category or accept the blank.
- The _(untracked)_ bucket is usage by skills absent from the metadata map — bundled/builtin skills, personal `~/.claude` skills, and repo skills without a `metadata` field alike; Phase 1 can't tell those apart.
- During the up-to-a-day overlap after a metadata change, joined panels may attribute a skill to its _old_ category (the `topk` tiebreak); it self-heals when the stale series ages out of the window.
- Set dimensions (`tags`) have no panel yet: filter ad hoc in Explore with `and on(skill_name) skill_tag{key="tags", value="…"}`.
