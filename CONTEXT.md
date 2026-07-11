# Wield

Tracks which Claude Code skills a team actually uses and where in their development lifecycle, so recommendations come from evidence rather than anecdotes. Skills are authored and invoked exactly as normal — this project only observes and annotates.

## Language

**Skill**:
A Claude Code skill folder (`SKILL.md` plus assets) living in a project's `.claude/skills/`. This project's tooling never writes to or moves skills — humans add tracking metadata to their own skills' frontmatter; the tools only read.

**Sidecar**:
The optional `meta.yaml` file inside a skill folder, next to `SKILL.md`. Since 2026-07-11 (ADR-0003) it is the _override_ for skills whose frontmatter can't be edited (plugin-provided, vendored) — dimensions normally live in frontmatter. When both exist, the sidecar wins wholesale and the scanner warns.
_Avoid_: manifest, config

**Tracked skill**:
A skill that carries dimensions — in its `SKILL.md` frontmatter `metadata` field (the normal case) or a sidecar (unowned skills). Untracked skills still appear in usage totals — they just carry no dimensions.
_Avoid_: registered skill, catalogued skill

**Dimension**:
A team-defined key in a skill's tracking metadata used to slice usage (e.g. `category`, `author`, `tags`). The format reserves no keys; teams choose their own vocabulary. Every dimension is either a grouping dimension or a set dimension, decided by the shape of its value.
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
The tool (`src/scan.ts`) that walks `.claude/skills/*/` in one or more roots — reading frontmatter `metadata` and sidecars — and exports the metadata map. A stateless pure function: files in, map out; it stores nothing and touches no network. Layout-agnostic: a monorepo is the single-root case, not a special case. Delivery (getting its output into a metrics store) is CI's job, not the scanner's.

**Metadata map**:
The contract every downstream consumer depends on: skill name → dimensions. The dashboard joins it against usage on `skill.name`. The JSON form is the durable artifact; the Prometheus info-metric form is a Phase 1 adapter on top of it. Producers are pluggable (ADR-0003): the scanner is metadata source #1; a CMS adapter or app-side tagging may later emit the same shape.
_Avoid_: index, catalogue

**Metadata source**:
Anything that produces the metadata map keyed by real `skill.name`s. The repo scanner is the first source, not the platform — the metadata twin of "Claude Code is the first adapter".

**Skill name**:
The join key, taken from the `name` in a skill's `SKILL.md` frontmatter — what Claude Code reports as `skill.name` in telemetry. The folder name is only a fallback; when the two disagree, the frontmatter wins and the scanner warns.

**Adapter**:
A source that turns some agent's activity into usage events matching the ingest contract (`docs/CONTRACT.md`). Claude Code OTEL is adapter #1 — the platform depends on the contract's shapes, never on Claude specifics.

**Dashboard**:
The visualization joining usage with the metadata map: most-used skills, usage per category, per person. Phase 1 is disposable Grafana panels; the product path is an app that fills the gap Grafana can't (category/tag views, per-person-per-category) — a magnet for adoption, never a prerequisite for starting.

**Registry**:
The north-star destination (Baton #86): an evidence-backed registry where teams publish skills and workflows with usage receipts. Not a marketplace, not "social media" — the differentiator is evidence. It stores published snapshots and links to skills; it never hosts telemetry or skill files.
_Avoid_: marketplace, social network

**Snapshot**:
The uniform unit a team publishes to the registry: a skill's identity, its dimensions, team-level evidence aggregates (breadth, frequency, retention — never per-person figures), and an optional narrative. Raw telemetry never leaves the team's own store; publishing is an explicit push (ADR-0004).
_Avoid_: report, export

**Declared workflow**:
A named composition of skills a team says belongs together (`workflows: [pr-flow]` set dimension; ordered docs are future tooling, Baton #97). Distinct from _observed_ workflows inferred from telemetry, which are out of reach while events mask custom skill names.

## Flagged ambiguities

- **Catalogue, loadout, variant, lineage, baseline, sync** — terms from the project's original design (a skill-distribution tool), descoped on 2026-07-10. Do not reintroduce them for current concepts; they refer only to the deferred distribution machinery parked in the Baton Ideas column (#81/#82/#83).
- **Tracking** means observing usage — never enforcing or restricting what anyone may use.

## Example dialogue

**Dev:** Sarah's `ticket-planner` doesn't show up under the plan category on the dashboard.
**Expert:** Is it a tracked skill? Check its `SKILL.md` frontmatter for a `metadata` field.
**Dev:** Just `name` and `description`, nothing else.
**Expert:** Then it only appears in overall usage. Add `metadata:` with `category: plan` to the frontmatter and the scanner will pick it up on the next merge — telemetry doesn't change at all, the join just gains a dimension. And it applies retroactively: all her past usage reorganises under plan, because metadata is joined at query time, never baked into telemetry.
**Dev:** It's really both plan and review. Can I put both?
**Expert:** Not on `category` — it's a grouping dimension, so a skill in two categories gets counted in both and the chart stops adding up. Pick the one you'd want it filed under, and put the rest in a set dimension like `tags` if you want to find it that way.
**Dev:** Should I give `grill-me` dimensions while I'm at it?
**Expert:** Only if the team wants it grouped somewhere. It's category-agnostic, so leaving it untracked is a legitimate choice, not an omission. And if it were a plugin skill you can't edit, that's the one case for a `meta.yaml` sidecar instead of frontmatter.
