# ADR-0003: Dimensions live in SKILL.md frontmatter; the metadata map is a pluggable contract

**Status:** accepted (2026-07-11) — supersedes the metadata-home part of ADR-0002; the query-time join itself is untouched. Decision 2 (the sidecar override) was later removed by [ADR-0005](0005-drop-sidecar.md).
**Tickets:** Baton #85 (format), #94 (delivery), #96 (scanner change)

## Context

Two frictions surfaced after a week of living with the v1 format:

1. **The sidecar is tedious.** Every tracked skill needs a second file (`meta.yaml`) that authors must remember exists. At two skills in, it already felt like a chore; asking a whole team to adopt a YAML convention on top of skill-writing is adoption drag exactly where the project can least afford it.
2. **Metadata management was pulling toward new dependencies.** A CMS (Sanity) as the metadata home was seriously considered — great editing UX, but it gates entry on a product many teams don't use and brands the project as "a Sanity app". App-owned metadata (tag skills in the dashboard) has the same flaw from the other side: the app becomes a prerequisite instead of a reward.

The adoption constraint that settled it: **starting must require nothing beyond git and whatever telemetry backend the team already runs.** The app arrives later as a magnet (the views Grafana can't render), never as a gate.

## Decision

### 1. Dimensions move into `SKILL.md` frontmatter, under the spec's `metadata` field

```yaml
---
name: ticket-planner
description: Break a plan into tickets…
metadata:
  category: plan
  author: sarah
  tags: [experimental]
---
```

One file, no sidecar to forget: adding tracking to a skill is three lines in the file you were already writing. All FORMAT.md rules carry over unchanged — open key→value map, nothing required, scalar groups / list filters.

**Verified 2026-07-11:** the Agent Skills spec (agentskills.io/specification) documents `metadata` as an _official_ frontmatter field for exactly this — "additional properties not defined by the spec", ignored by clients. Claude Code injects only `name` and `description` into model context; frontmatter never enters prompts, so dimensions add zero prompt weight. This falsifies ADR-0002's premise for rejecting frontmatter ("mixes tracking data into a prompt-bearing file") — the tracking data never reaches the prompt.

_Caveat:_ the spec types `metadata` values as string→string. Our list-valued dimensions (`tags: [a, b]`) are a deliberate extension — safe today because clients ignore `metadata` content entirely and our scanner is the only consumer. If a client ever enforces strict string-only values, the sidecar remains the escape hatch.

### 2. The sidecar `meta.yaml` demotes to an override for unowned skills

Plugin-provided or vendored skills can't have their frontmatter edited without forking. For those, `meta.yaml` next to the skill (or where the team materializes it) still works. **Precedence: when both exist, the sidecar wins wholesale and the scanner warns** — no per-key merging.

FORMAT.md rule 4 ("tooling never edits `SKILL.md`") survives with sharpened meaning: _humans_ write dimensions into frontmatter; our tooling only ever **reads** skill files.

### 3. The metadata map is the contract; producers are pluggable

Everything downstream — Grafana info-metric adapter, dashboard app, future registry publishing — consumes the **metadata map** (skill name → dimensions, per CONTRACT.md) and never asks who produced it. Mirroring ingest ("Claude Code is the first adapter, not the platform"): **the repo scanner is the first metadata source, not the platform.**

Sanctioned future sources, none built now:

- **CMS adapter** (e.g. Sanity, Baton #98): a team that manages skills in a CMS exports the same map shape. Their convenience, invisible to every other team. The one invariant an alternative source must own: entries keyed by the exact `skill.name` telemetry reports (the `SKILL.md` frontmatter name).
- **App-side tagging**: remains "acceptable later as an addition, never a replacement" (ADR-0002's stance, reaffirmed).

### 4. The scanner runs in CI, on merge

The scanner stays a stateless pure function (files in → map out; no storage, no network). CI on merge to main runs it and delivers: JSON map as the artifact, prom text pushed to the metrics store (`promtool push` or equivalent — Baton #94). Freshness stops being anyone's chore; metadata changes reach dashboards within a minute of merging. The scanner itself remains delivery-agnostic — it prints standard formats (JSON, Prometheus exposition) and lets one line of CI glue bind them to any backend.

## Alternatives rejected as the primary home

- **CMS (Sanity) as source of truth** — gates adoption on a product; splits skill bodies and metadata across systems (split-brain); brands the platform. Lives on as optional source adapter (#98).
- **App-owned metadata** — best editing UX (two-click tagging, UI-enforced vocabulary, no discovery needed since telemetry delivers names), but makes the app a prerequisite. Returns later as an additional source once the app has earned adoption on its own.
- **Central `skills.yaml` per root** — still drifts from folders and dies when a skill is copied (ADR-0002's critique stands).

## Consequences

- Scanner learns to read the frontmatter `metadata` field, keeps sidecar support, applies the precedence rule and warning (#96). Small change — it already parses `SKILL.md` frontmatter for the canonical name.
- FORMAT.md, CONTEXT.md, CONTRACT.md, README amended (2026-07-11) — frontmatter-primary, sidecar-override, pluggable sources.
- Nothing else moves: query-time join, info-metric scaffolding, ADR-0001 backend choice, and the Phase 1 sequence are all unchanged.
- `examples/repo` should gain a frontmatter-tracked skill alongside the sidecar one, since both paths stay supported.
