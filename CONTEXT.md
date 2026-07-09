# Skill Tracking

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
A team-defined key in a sidecar used to group usage (e.g. `stages`, `author`). Values are strings or lists of strings. The format reserves no keys; teams choose their own vocabulary.
_Avoid_: category, tag, label, property

**Stage**:
A value of the `stages` dimension — a step in the team's development lifecycle (e.g. `spec`, `plan`, `implement`, `test`, `review`). A convention, not a built-in: agnostic skills simply omit it.
_Avoid_: phase, step, column

**Usage**:
Skill invocations observed via Claude Code OTEL telemetry (`claude_code.skill_activated` events, keyed by `skill.name`, attributed per user). Covers all skills, tracked or not.
_Avoid_: adoption, activity

**Scanner**:
The tool that walks `.claude/skills/*/meta.yaml` in a repo and exports the metadata map.

**Metadata map**:
The scanner's output: skill name → dimensions. The dashboard joins it against usage on `skill.name`.
_Avoid_: index, catalogue

**Dashboard**:
The visualization joining usage with the metadata map: most-used skills, usage per stage, per person.

## Flagged ambiguities

- **Catalogue, loadout, variant, lineage, baseline, sync** — terms from the project's original design (a skill-distribution tool), descoped on 2026-07-10. Do not reintroduce them for current concepts; they refer only to the deferred distribution machinery parked in the Baton Ideas column (#81/#82/#83).
- **Tracking** means observing usage — never enforcing or restricting what anyone may use.

## Example dialogue

**Dev:** Sarah's `ticket-planner` doesn't show up under the plan stage on the dashboard.
**Expert:** Is it a tracked skill? Check for a sidecar in its folder.
**Dev:** No `meta.yaml`, just `SKILL.md`.
**Expert:** Then it only appears in overall usage. Add a sidecar with `stages: [plan]` and the scanner will pick it up on the next export — telemetry doesn't change at all, the join just gains a dimension.
**Dev:** Should I tag `grill-me` while I'm at it?
**Expert:** Only if the team wants it grouped somewhere. It's stage-agnostic, so leaving it untracked is a legitimate choice, not an omission.
