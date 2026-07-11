# ADR-0002: Metadata is joined at query time; Grafana dashboards are scaffolding

**Status:** accepted (2026-07-10) — direction confirmed after a design review of the join architecture
**Tickets:** Baton #79 (dashboard + join), #80 (telemetry pipeline)

## Context

Telemetry carries only `skill.name`, user attribution, and cost/token numbers — Claude Code decides the attributes, and team dimensions like `category` are not among them. Dimensions live in `meta.yaml` sidecars ([FORMAT.md](../FORMAT.md)) in the repo. The two datasets must be combined somewhere, and the ambition beyond Phase 1 is a product-like dashboard app (browse skills, per-category views, recommendations), which Grafana panels cannot provide.

## Decision

**The join happens at query/read time, in the dashboard layer — metadata is never baked into the telemetry.** Two variants, used in sequence:

1. **Phase 1 (disposable): Grafana panels with an info-metric join.** The scanner renders the metadata map as `skill_meta{skill_name=..., category=...} 1` series (the `kube_pod_labels`/`target_info` pattern) and panels join via PromQL `* on(skill_name) group_left(...)`. Explicitly scaffolding — validates the data during rollout, gets thrown away without regret.
2. **Product path: app-side join.** The dashboard app queries the metrics store over the **Prometheus HTTP query API** (a de facto standard: Mimir, Prometheus, VictoriaMetrics, Thanos), reads the metadata map from the repo, and joins in application code. All category/recommendation logic lives in testable app code; metadata is read fresh from the repo at request time.

## Why not bake metadata into telemetry or the database

- Claude Code's exporter is not extensible with custom attributes — there is no "bake it in" option at the source.
- Info-metrics as a _permanent_ home are a poor fit: they cannot hold list values (see below), and the freshness cron is operational cruft. Fine as scaffolding, wrong as foundation.
- App-side join keeps the repo the single source of truth and needs no push infrastructure.

## How list-valued dimensions are handled (amends FORMAT.md, 2026-07-10)

A Prometheus label holds one string, so `category: [plan, review]` has no direct rendering. The original format let _any_ key be a list, on the stated premise that this "keeps every key groupable". That premise was wrong, and the failure is not graceful: a `group_left` join requires the metadata side to have **exactly one series per `skill_name`**. Fan a skill out into two `skill_meta` series and PromQL raises _"many-to-one matching must be unique"_ — the panel breaks for every skill, not just the multi-valued one.

The resolution is to let the **shape of the value declare its meaning**, for any key, reserving none:

- **Scalar → a partition.** Rendered as a label on `skill_meta`, one series per skill. Group by it; buckets sum to the total.
- **List → a set.** Rendered as `skill_tag{skill_name, key, value} 1`, one series per member, keyed so `tags` and `invokes` stay distinct on one metric. Filter by it with a set operator (`and on(skill_name)`), which permits the many-to-many matching that `group_left` forbids.

Grouping by a set is not a mechanical limitation we are working around — it is ill-defined. A skill tagged `plan` and `review` belongs fully to both, so the buckets overlap and cannot reconcile against the grand total. Filtering is the operation a set supports. The app-side join (variant 2) will do exactly this arithmetic in code, so the scaffolding tells the same truth as its replacement.

Consequences: `category` becomes scalar, `tags` is the conventional list-valued key, and `skill_meta` always emits a row per tracked skill (even one with no scalars) to keep the `group_left` side total. A panel that insists on grouping by a set can still do so with `group_right`, accepting the overlap.

## Alternatives considered

**Metadata scheme** — sidecar `meta.yaml` reaffirmed over: frontmatter inside `SKILL.md` (mixes tracking data into a prompt-bearing file Claude Code parses), a central `skills.yaml` (drifts from folders, dies when a skill is copied), and app-DB tagging (breaks metadata-as-code; acceptable later as an _addition_, never a replacement).

**Usage signal** — a `PostToolUse` hook on the `Skill` tool (committed to project settings) is a viable alternative: real skill names with no masking, no managed-settings/sudo deployment, transparent in-repo tracking code. Costs: invocations only (no cost/tokens), per-repo coverage, DIY delivery plumbing. OTEL stays the choice (cost data is product surface; machine-wide coverage; officially supported), but **hooks are the documented fallback** if the metrics-side `skill.name` behavior ever breaks (see masking table in `otel/README.md`).

**Backend** — Grafana Cloud is not load-bearing: OTLP is vendor-neutral and switching is a two-line managed-settings change (per ADR-0001). The eventual self-contained OSS shape — the dashboard app exposing its **own OTLP ingest** with SQLite/Postgres storage (SigNoz/Langfuse-style; also the position from which `tool_parameters` could be stripped to unmask event names, and PII kept on-prem) — is **deliberately deferred, not rejected**: parked in Baton Ideas until the app itself is committed to.

## Consequences

- Phase 1 proceeds unchanged: OTEL → Grafana direct export, sidecars, scanner. "Merging from Grafana and metadata when needed" is the working mode.
- Nothing built for variant 2 is wasted if the app later grows its own ingest — the join logic carries over; only the data source behind it swaps.
- The scanner's real deliverable is the metadata map (JSON); the info-metric push is an optional Phase 1 adapter on top, not the core.
- The scanner takes a skill's name from its `SKILL.md` frontmatter, not its folder — that is what telemetry reports on `skill.name`, and a mismatch would join against nothing.
