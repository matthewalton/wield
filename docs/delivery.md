# Delivery — getting the metadata map into the metrics store

**Status:** v1 (2026-07-11), per [ADR-0003 §4](adr/0003-frontmatter-metadata.md)
**Ticket:** Baton #94

The scanner is a stateless pure function — files in, map out; no storage, no network. Delivery is CI glue around it: [`push-skill-metadata.yml`](../.github/workflows/push-skill-metadata.yml) runs on merge to main (plus a daily re-push and manual dispatch), renders the map in both formats, uploads the **JSON map as the build artifact** (the durable deliverable), and pushes the **Prometheus info metrics** to the metrics store via `promtool push metrics`. Without this leg, the Phase 1 `group_left` join has nothing to join against.

This whole leg is Phase 1 scaffolding: the product path (app-side join reading the JSON map, [ADR-0002](adr/0002-query-time-join.md)) needs none of it.

## Secrets

Configured as GitHub Actions secrets; when absent the workflow still renders and uploads the artifact, and skips the push with a notice.

| Secret                       | Value (Grafana Cloud)                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `PROM_REMOTE_WRITE_URL`      | The stack's remote_write push endpoint, e.g. `https://prometheus-prod-XX.grafana.net/api/prom/push` |
| `PROM_REMOTE_WRITE_USERNAME` | The stack's numeric instance/user ID                                                                |
| `PROM_REMOTE_WRITE_PASSWORD` | A `glc_` access-policy token with `metrics:write`                                                   |

The workflow builds the `Authorization: Basic base64(username:password)` header itself — the same encoding gotcha noted in [`otel/README.md`](../otel/README.md) (the token alone, unpaired with the instance ID, fails auth silently).

## Using it from a skills-bearing repo

The workflow is reusable; a team repo holding `.claude/skills/` needs one job:

```yaml
on:
  push:
    branches: [main]
  schedule:
    - cron: "17 6 * * *" # daily re-push; see freshness below

jobs:
  push-skill-metadata:
    uses: matthewalton/wield/.github/workflows/push-skill-metadata.yml@main
    with:
      roots: . # space-separated roots to scan
    secrets: inherit
```

For non-Prometheus-flavored stores, the standard bridges are: scrape the rendered file from somewhere, a native import endpoint (e.g. VictoriaMetrics `/api/v1/import/prometheus`), or a custom adapter reading the JSON map artifact.

## Freshness and hygiene (read before writing panels)

Pushed samples carry the push timestamp and are never refreshed by scraping, so two constraints follow. Both were verified against a live Prometheus (2026-07-11).

1. **Freshness.** An instant query sees a series only for the 5-minute lookback after its last sample. The daily cron re-push plus a `last_over_time(skill_meta[25h])` wrapper in panels keeps the map continuously visible. Widen the window and the map survives missed pushes longer, at the cost of point 2.

2. **Hygiene.** Each push is a full rewrite of the current map, but old series are not deleted — they just stop being pushed. When a skill's scalar dimensions change, both the old and new `skill_meta` series live inside the `last_over_time` window until the old one ages out, and the naive join **errors outright** ("found duplicate series … many-to-many matching not allowed"), blanking the panel. Harden the one side of every join with `topk`:

   ```promql
   sum by (skill_name) (rate(claude_code_token_usage_total[1h]))
     * on(skill_name) group_left(category)
       topk by (skill_name) (1, last_over_time(skill_meta[25h]))
   ```

   `topk` restores the one-row-per-skill invariant mechanically; during the overlap window it may pick the stale value, then self-heals once the old series leaves the window. The overlap lasts up to the window length after a metadata change, so keep the window as tight as the push cadence allows — `25h` against the daily cron. (`workflow_dispatch` gets _new_ metadata in immediately, but nothing shortens the old series' stay in the window.)

   `skill_tag` set-membership filters (`and on(skill_name) …`) are unaffected: extra stale members loosen the filter briefly but never break the query.

All pushed series carry `job="wield"`.
