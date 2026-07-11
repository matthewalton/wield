# Skill dimensions — the tracking metadata format

**Status:** v2 (2026-07-11) — dimensions moved into `SKILL.md` frontmatter, sidecar demoted to override ([ADR-0003](adr/0003-frontmatter-metadata.md)). v1 (sidecar-primary) was 2026-07-10.

Dimensions are team-defined key→value metadata on a skill, used to slice usage on the dashboard. **Having dimensions opts the skill into enriched tracking.** Skills without them are still usage-tracked by telemetry (per-skill `skill.name` on cost/token metrics — verified live 2026-07-10; `skill_activated` events also fire but mask custom skill names to `custom_skill`, see `otel/README.md`); they just carry no dimensions to group by.

## Where dimensions live

**Primary: the `metadata` field in `SKILL.md` frontmatter** — an official Agent Skills spec field for exactly this ("additional properties not defined by the spec"; clients ignore it, and frontmatter never enters the model's prompt):

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

**Override: a `meta.yaml` sidecar** next to `SKILL.md`, for skills whose frontmatter you can't edit (plugin-provided or vendored skills you'd otherwise have to fork). Same keys, same rules, no `metadata:` wrapper:

```
.claude/skills/ticket-planner/
  SKILL.md
  meta.yaml     # only for unowned skills
```

**Precedence:** when both exist, the sidecar wins wholesale (no per-key merging) and the scanner warns.

## Rules

1. Dimensions form an open key → value map. **No keys are required.**
2. Every value must be a **string or a list of strings**. Nested maps, numbers, and booleans are invalid. (The Agent Skills spec types `metadata` values as strings; lists are our deliberate extension — safe because clients ignore `metadata` content, and the sidecar remains the escape hatch if one ever objects.)
3. Keys are **dimensions**: team-defined vocabulary. The format reserves nothing; the conventions below are suggestions.
4. Tooling never _writes_ to `SKILL.md` — humans put dimensions in frontmatter; our tools only read skill files.
5. Unknown keys are never errors. Consumers ignore what they don't understand.

## The shape of a value decides how it can be used

This is the one rule worth internalising, and it applies to **every key** — the format still reserves none.

| Shape                                   | Is a      | The dashboard can                                                                          |
| --------------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| **Scalar** — `category: plan`           | partition | **group** by it. Every skill lands in exactly one bucket, so the buckets sum to the total. |
| **List** — `tags: [experimental, slow]` | set       | **filter** by it. A skill can be in many buckets at once, so grouping would double-count.  |

Reach for a list only when a skill genuinely belongs to several values at once. If every skill has exactly one value for a key, make it scalar and you get a chart you can group by. This is why `category` is a scalar: `category: [plan, review]` is not a skill in a "plan and review" bucket, it's a skill counted twice.

The dashboard mechanics that follow from this — and why a list can't simply be a Prometheus label — are in [ADR-0002](adr/0002-query-time-join.md).

## Conventional keys

| Key           | Shape  | Meaning                                                                                                                                                                                                       |
| ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category`    | scalar | Where the skill fits in the team's chosen taxonomy. Lifecycle stages (`spec`, `plan`, `implement`, `test`, `review`) are one common scheme — the format doesn't care which you pick. Agnostic skills omit it. |
| `author`      | scalar | Who wrote/owns the skill.                                                                                                                                                                                     |
| `tags`        | list   | Free-form set membership: `experimental`, `slow`, `needs-review`. The catch-all for anything a skill can be several of.                                                                                       |
| `workflows`   | list   | Named skill compositions this skill belongs to (e.g. `pr-flow`) — filter to see a whole workflow's usage per step. Ordered workflow docs are future tooling (Baton #97).                                      |
| `invokes`     | list   | Other skills this one invokes (documented intent; reserved for future tooling).                                                                                                                               |
| `forked_from` | scalar | Provenance, if adapted from another skill (reserved for future tooling).                                                                                                                                      |

The skill's name — the key everything joins on — is the `name` in `SKILL.md` frontmatter, because that is what Claude Code reports as `skill.name` in telemetry. The scanner warns when it disagrees with the folder name.

## Vocabulary drift

Free-form values can drift (`plan` vs `planning`), which fragments dashboard groupings. Planned mitigations, both optional: a lint that warns on near-duplicate values across a repo, and a vocab file for teams that want strict validation. Flexible by default, strict by choice.

## How it's consumed

The **scanner** (`src/scan.ts`) walks `.claude/skills/*/` in one or more roots — reading frontmatter `metadata` and any sidecars (frontmatter support in progress, Baton #96) — and exports the merged **metadata map** (skill name → dimensions). Where the skills live (monorepo, dedicated repo, plugin repo) is the team's choice, not the format's. The **dashboard** joins that map against OTEL usage data on `skill.name` to render usage overall, per dimension value, and per person.

```console
$ node src/cli.ts --root examples/repo               # the metadata map, as JSON
$ node src/cli.ts --root examples/repo --format prom # Phase 1 Grafana adapter
```

The map is a **contract, not a scanner detail**: anything that emits the same shape keyed by real `skill.name`s is a legitimate metadata source ([ADR-0003](adr/0003-frontmatter-metadata.md) — e.g. a CMS adapter, or app-side tagging later). The scanner is source #1, the one every team with a git repo already has.

Two skills sharing one name across roots cannot be told apart by telemetry, so the scanner keeps the first and warns. A skill with no dimensions is simply untracked: still counted in overall usage, just carrying no dimensions.
