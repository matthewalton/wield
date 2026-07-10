# Wield

Tracks which Claude Code skills a team actually uses and where in their development lifecycle, so recommendations come from evidence rather than anecdotes. Skills are authored and invoked exactly as normal — this project only observes and annotates.

## Language

**Skill**:
A Claude Code skill folder (`SKILL.md` plus assets) living in a project's `.claude/skills/`. This project never edits or moves skills.

**Sidecar**:
The optional `meta.yaml` file inside a skill folder, next to `SKILL.md`. Its presence opts the skill into enriched tracking; its absence means the skill is tracked for raw usage only.
_Avoid_: manifest, frontmatter, config

**Tracked skill**:
A skill whose folder contains a sidecar. Untracked skills still appear in usage totals — they just carry no dimensions.
_Avoid_: registered skill, catalogued skill

**Dimension**:
A team-defined key in a sidecar used to slice usage (e.g. `category`, `author`, `tags`). The format reserves no keys; teams choose their own vocabulary. Every dimension is either a grouping dimension or a set dimension, decided by the shape of its value.
_Avoid_: tag, label, property (as synonyms for the concept — `tags` is one particular dimension, not the word for all of them)

**Grouping dimension**:
A dimension whose value is a **scalar** (`category: plan`). It partitions the skills, so the dashboard can group by it and the buckets sum to the total.

**Set dimension**:
A dimension whose value is a **list** (`tags: [experimental, slow]`). A skill belongs to every member at once, so the dashboard filters by it and never groups by it — overlapping buckets would double-count. Reach for one only when a skill genuinely holds several values at once.

**Category**:
A value of the `category` dimension — where a skill fits in the team's chosen taxonomy. Lifecycle stages (`spec`, `plan`, `implement`, `test`, `review`) are one common scheme, not a built-in; agnostic skills simply omit the key. It is a grouping dimension: one category per skill, or none.
_Avoid_: stage (as a format concept — fine as a team's own category values), phase, column

**Usage**:
Skill activity observed via Claude Code OTEL telemetry, keyed by `skill.name` on cost/token **metrics** (verbatim for our skills) and attributed per user. The `skill_activated` events add invocation-trigger detail but mask custom skill names, so metrics are the join source (see `otel/README.md`). Covers all skills, tracked or not.
_Avoid_: adoption, activity

**Scanner**:
The tool (`src/scan.ts`) that walks `.claude/skills/*/meta.yaml` in one or more roots and exports the metadata map. Layout-agnostic: a monorepo is the single-root case, not a special case.

**Metadata map**:
The scanner's output, merged across roots: skill name → dimensions. The dashboard joins it against usage on `skill.name`. The JSON form is the durable artifact; the Prometheus info-metric form is a Phase 1 adapter on top of it.
_Avoid_: index, catalogue

**Skill name**:
The join key, taken from the `name` in a skill's `SKILL.md` frontmatter — what Claude Code reports as `skill.name` in telemetry. The folder name is only a fallback; when the two disagree, the frontmatter wins and the scanner warns.

**Adapter**:
A source that turns some agent's activity into usage events matching the ingest contract (`docs/CONTRACT.md`). Claude Code OTEL is adapter #1 — the platform depends on the contract's shapes, never on Claude specifics.

**Dashboard**:
The visualization joining usage with the metadata map: most-used skills, usage per category, per person.

## Flagged ambiguities

- **Catalogue, loadout, variant, lineage, baseline, sync** — terms from the project's original design (a skill-distribution tool), descoped on 2026-07-10. Do not reintroduce them for current concepts; they refer only to the deferred distribution machinery parked in the Baton Ideas column (#81/#82/#83).
- **Tracking** means observing usage — never enforcing or restricting what anyone may use.

## Example dialogue

**Dev:** Sarah's `ticket-planner` doesn't show up under the plan category on the dashboard.
**Expert:** Is it a tracked skill? Check for a sidecar in its folder.
**Dev:** No `meta.yaml`, just `SKILL.md`.
**Expert:** Then it only appears in overall usage. Add a sidecar with `category: plan` and the scanner will pick it up on the next export — telemetry doesn't change at all, the join just gains a dimension.
**Dev:** It's really both plan and review. Can I put both?
**Expert:** Not on `category` — it's a grouping dimension, so a skill in two categories gets counted in both and the chart stops adding up. Pick the one you'd want it filed under, and put the rest in a set dimension like `tags` if you want to find it that way.
**Dev:** Should I give `grill-me` a sidecar while I'm at it?
**Expert:** Only if the team wants it grouped somewhere. It's category-agnostic, so leaving it untracked is a legitimate choice, not an omission.
