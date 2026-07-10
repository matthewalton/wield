# ADR-0002: Metadata is joined at query time; Grafana dashboards are scaffolding

**Status:** accepted (2026-07-10) — direction confirmed after a design review of the join architecture
**Tickets:** Baton #79 (dashboard + join), #80 (telemetry pipeline)

## Context

Telemetry carries only `skill.name`, user attribution, and cost/token numbers — Claude Code decides the attributes, and team dimensions like `category` are not among them. Dimensions live in `meta.yaml` sidecars ([FORMAT.md](../FORMAT.md)) in the repo. The two datasets must be combined somewhere, and the ambition beyond Phase 1 is a product-like dashboard app (browse skills, per-category views, recommendations), which Grafana panels cannot provide.

## Decision

**The join happens at query/read time, in the dashboard layer — metadata is never baked into the telemetry.** Two variants, used in sequence:

1. **Phase 1 (disposable): Grafana panels with an info-metric join.** The scanner pushes the metadata map as `skill_meta{skill_name=..., category=...} 1` series (the `kube_pod_labels`/`target_info` pattern) and panels join via PromQL `* on(skill_name) group_left(...)`. Explicitly scaffolding — validates the data during rollout, gets thrown away without regret.
2. **Product path: app-side join.** The dashboard app queries the metrics store over the **Prometheus HTTP query API** (a de facto standard: Mimir, Prometheus, VictoriaMetrics, Thanos), reads the metadata map from the repo, and joins in application code. All category/recommendation logic lives in testable app code; metadata is read fresh from the repo at request time.

## Why not bake metadata into telemetry or the database

- Claude Code's exporter is not extensible with custom attributes — there is no "bake it in" option at the source.
- Info-metrics as a *permanent* home are a poor fit: Prometheus labels cannot hold list values (`category: [plan, review]` per FORMAT.md), and the freshness cron is operational cruft. Fine as scaffolding, wrong as foundation.
- App-side join keeps the repo the single source of truth and needs no push infrastructure.

## Alternatives considered

**Metadata scheme** — sidecar `meta.yaml` reaffirmed over: frontmatter inside `SKILL.md` (mixes tracking data into a prompt-bearing file Claude Code parses), a central `skills.yaml` (drifts from folders, dies when a skill is copied), and app-DB tagging (breaks metadata-as-code; acceptable later as an *addition*, never a replacement).

**Usage signal** — a `PostToolUse` hook on the `Skill` tool (committed to project settings) is a viable alternative: real skill names with no masking, no managed-settings/sudo deployment, transparent in-repo tracking code. Costs: invocations only (no cost/tokens), per-repo coverage, DIY delivery plumbing. OTEL stays the choice (cost data is product surface; machine-wide coverage; officially supported), but **hooks are the documented fallback** if the metrics-side `skill.name` behavior ever breaks (see masking table in `otel/README.md`).

**Backend** — Grafana Cloud is not load-bearing: OTLP is vendor-neutral and switching is a two-line managed-settings change (per ADR-0001). The eventual self-contained OSS shape — the dashboard app exposing its **own OTLP ingest** with SQLite/Postgres storage (SigNoz/Langfuse-style; also the position from which `tool_parameters` could be stripped to unmask event names, and PII kept on-prem) — is **deliberately deferred, not rejected**: parked in Baton Ideas until the app itself is committed to.

## Consequences

- Phase 1 proceeds unchanged: OTEL → Grafana direct export, sidecars, scanner. "Merging from Grafana and metadata when needed" is the working mode.
- Nothing built for variant 2 is wasted if the app later grows its own ingest — the join logic carries over; only the data source behind it swaps.
- The scanner's real deliverable is the metadata map (JSON); the info-metric push is an optional Phase 1 adapter on top, not the core.
