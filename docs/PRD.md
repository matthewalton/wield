# PRD: Skill Usage Tracking — Phase 1

> **Rewritten 2026-07-10** after a grilling session descoped the original "catalogue + CLI" plan (preserved in the notes of Baton ticket #87). The catalogue repo, loadouts, sync/materializer, variants/lineage, and import CLI are all **deferred until distribution pain is proven**. Baton tickets #81/#82/#83 hold those ideas.

## Problem Statement

Our team has no picture of which Claude Code skills people actually use, where in the development lifecycle they use them, or what's worth adopting. Good workflows stay siloed with their inventor; recommendations are anecdotes, not evidence.

## Solution

**Track skill usage in the project, and make it visible.** Nothing about authoring or using skills changes:

- Skills live in the project's `.claude/skills/` folder (committed to the repo as today) and are invoked as normal.
- **All** skill invocations are tracked via Claude Code OTEL telemetry — per skill, per person. No opt-in needed for raw usage.
- A skill can *optionally* carry a **`meta.yaml` sidecar** in its skill folder. Its presence opts the skill into enriched tracking with team-defined dimensions. The conventional `category` key is taxonomy-agnostic — our team will likely use lifecycle values (`plan`, `implement`, `test`, `review`, …), other teams whatever they care about. Agnostic skills (e.g. grill-me) simply stay untagged.
- A **dashboard** joins telemetry (`skill.name`) with the scanned metadata map to answer: what's used most? what does each person use in each category? what should I try when planning?

## Components

1. **Sidecar format `meta.yaml`** (#85): spec + committed example — **done 2026-07-10**, see [`FORMAT.md`](FORMAT.md) and [`examples/ticket-planner`](../examples/ticket-planner). Open key→value map (string / list-of-string values), no required or reserved keys; conventional: `category`, `author`, plus `invokes` and `forked_from` earmarked for future tooling. Vocabulary drift handled by an optional lint / optional vocab file — flexible by default, strict by choice.
2. **Telemetry pipeline** (#80 — now the core ticket): Claude Code OTEL via managed settings → OTLP backend (direct export, no collector for Phase 1 — see [ADR-0001](adr/0001-otlp-backend.md)). Skill events with per-user attribution.
3. **Dashboard + join** (#79): scanner exports the skill→metadata map from the repo; dashboard renders usage overall, by category/dimension, by person.

## Prerequisites & Risks

- **Org/team consent for per-person telemetry (incl. cost) is a Phase 1 prerequisite** — start that conversation immediately; it's the slowest dependency. Cultural agreement stands: numbers are for learning, never performance review.
- Vocabulary drift across sidecars — mitigated by lint/optional vocab, accepted knowingly.

## Out of Scope

- Distribution machinery: catalogue repo, sync/materializer, loadouts, import, branch/variants (Baton #81/#82/#83, parked in Ideas).
- Enforcing workflows or restricting skill use; automated promotion by metrics.
- Hosted multi-team SaaS (Baton #86).

## Notes

- `skill-tracking` is a working name — the final name is Baton #76. Domain language lives in [`CONTEXT.md`](../CONTEXT.md).
- Ticket references (#NN) point at the team's Baton board, project "Team Workflow Sharing".
- Team-first but OSS-shaped: nothing company-specific hardcoded; dimensions are data, not code.
