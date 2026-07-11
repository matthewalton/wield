# PRD: Skill Usage Tracking — Phase 1

> **Rewritten 2026-07-10** after a grilling session descoped the original "catalogue + CLI" plan (preserved in the notes of Baton ticket #87). The catalogue repo, loadouts, sync/materializer, variants/lineage, and import CLI are all **deferred until distribution pain is proven**. Baton tickets #81/#82/#83 hold those ideas.

## Problem Statement

Our team has no picture of which Claude Code skills people actually use, where in the development lifecycle they use them, or what's worth adopting. Good workflows stay siloed with their inventor; recommendations are anecdotes, not evidence.

## Solution

**Track skill usage in the project, and make it visible.** Nothing about authoring or using skills changes:

- Skills live in the project's `.claude/skills/` folder (committed to the repo as today) and are invoked as normal.
- **All** skill invocations are tracked via Claude Code OTEL telemetry — per skill, per person. No opt-in needed for raw usage.
- A skill can _optionally_ carry **dimensions** — team-defined metadata in its `SKILL.md` frontmatter (`metadata` field) that opts it into enriched tracking. The conventional `category` key is taxonomy-agnostic — our team will likely use lifecycle values (`plan`, `implement`, `test`, `review`, …), other teams whatever they care about. Agnostic skills (e.g. grill-me) simply stay untagged.
- A **dashboard** joins telemetry (`skill.name`) with the scanned metadata map to answer: what's used most? what does each person use in each category? what should I try when planning?

## North Star

The long-term direction (Baton #86, direction reaffirmed 2026-07-10, boundary model decided 2026-07-11): a multi-team platform where teams share skills backed by real usage evidence — an **evidence-backed registry**, not a plain marketplace. The sequence is **tracking → visibility → distribution**: tracking is plumbing, visibility is the product (and the core loop of the north star), and distribution machinery waits for the pull that visibility creates ("that skill looks great, how do I get it?"). The Out of Scope items below are **staged, not rejected**.

How evidence crosses team boundaries is fixed ahead of need ([ADR-0004](adr/0004-published-aggregates.md)): **raw and per-person telemetry never leave a team's own metrics store**; teams publish snapshots — team-level aggregates (breadth, frequency, retention) plus metadata and a narrative — by explicit action. The registry stores claims with receipts; telemetry never migrates to it. Workflows, not just skills, are the intended registry unit eventually: declared skill compositions with per-step evidence (Baton #97).

Two principles bind Phase 1 decisions to that direction:

1. **Claude Code is the first adapter, not the platform.** Everything downstream of ingest depends only on the shapes in [CONTRACT.md](CONTRACT.md), never on who produced them. No second adapter gets built now — the contract just keeps the boundary clean.
2. **Data-first, not hosting-first.** The platform's differentiator is usage evidence; it points at wherever skills live rather than owning the files. Tooling stays agnostic to repo layout (monorepo vs. dedicated skills repo vs. plugins).
3. **Starting requires nothing new** (added 2026-07-11, ADR-0003). Entry cost is git plus whatever telemetry backend the team already runs. The metadata map is a pluggable contract — the repo scanner is the first source, not the platform — and the future app is a magnet (the views Grafana can't render), never a gate. Nothing a team must adopt before their first tracked skill.

## Components

1. **Dimensions format** (#85, amended by #96): spec + committed example — see [`FORMAT.md`](FORMAT.md) and [`examples/repo`](../examples/repo). **v3 (2026-07-11, [ADR-0003](adr/0003-frontmatter-metadata.md) + [ADR-0005](adr/0005-drop-sidecar.md)): dimensions live in `SKILL.md` frontmatter under the spec's official `metadata` field — the only home; the `meta.yaml` sidecar was removed.** Open key→value map, no required or reserved keys; conventional: `category`, `author`, `tags`, `workflows`, plus `invokes` and `forked_from` earmarked for future tooling. A value's shape decides its use — scalars group, lists filter (amended 2026-07-10, see [ADR-0002](adr/0002-query-time-join.md)). Vocabulary drift handled by an optional lint / optional vocab file — flexible by default, strict by choice.
2. **Telemetry pipeline** (#80 — now the core ticket): Claude Code OTEL via managed settings → OTLP backend (direct export, no collector for Phase 1 — see [ADR-0001](adr/0001-otlp-backend.md)). Skill events with per-user attribution.
3. **Dashboard + join** (#79): scanner exports the skill→metadata map from one or more roots (our monorepo is simply the single-root case) — **scanner done 2026-07-10** (`src/`, JSON + Prometheus adapter); frontmatter support pending (#96); delivery = CI runs the scanner on merge and pushes info-metrics to the store (#94). Dashboard renders usage overall, by category/dimension, by person.

## Prerequisites & Risks

- **Org/team consent for per-person telemetry (incl. cost) is a Phase 1 prerequisite** — start that conversation immediately; it's the slowest dependency. Cultural agreement stands: numbers are for learning, never performance review.
- Vocabulary drift across dimension values — mitigated by lint/optional vocab, accepted knowingly.

## Out of Scope

- Distribution machinery: catalogue repo, sync/materializer, loadouts, import, branch/variants (Baton #81/#82/#83, parked in Ideas). If revived, evaluate Claude Code plugin marketplaces before building custom sync — plugins already distribute team-wide skills from a shared repo.
- Dedicated skill versioning (semver/releases): git history covers it while producer and consumer are the same repo; it only earns its keep once other teams consume skills at their own pace. Telemetry also joins on bare `skill.name`, so versions would be invisible to the dashboard anyway.
- Enforcing workflows or restricting skill use; automated promotion by metrics.
- Hosted multi-team SaaS (Baton #86).

## Notes

- The project is named **Wield** (decided 2026-07-10, Baton #76). Domain language lives in [`CONTEXT.md`](../CONTEXT.md).
- Ticket references (#NN) point at the team's Baton board, project "Wield".
- Team-first but OSS-shaped: nothing company-specific hardcoded; dimensions are data, not code.
