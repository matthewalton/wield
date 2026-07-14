# Skill dimensions — the tracking metadata format

**Status:** v3 (2026-07-11) — the `meta.yaml` sidecar removed; frontmatter is the only home ([ADR-0005](adr/0005-drop-sidecar.md)). v2 (frontmatter-primary, sidecar override, [ADR-0003](adr/0003-frontmatter-metadata.md)) was earlier the same day; v1 (sidecar-primary) was 2026-07-10.

Dimensions are team-defined key→value metadata on a skill, used to slice usage on the dashboard. **Having dimensions opts the skill into enriched tracking.** Skills without them are still usage-tracked by telemetry (per-skill `skill.name` on cost/token metrics — verified live 2026-07-10; `skill_activated` events also fire but mask custom skill names to `custom_skill`, see `ops/otel/README.md`); they just carry no dimensions to group by.

## Where dimensions live

Dimensions live in one place: **the `metadata` field in `SKILL.md` frontmatter** — an official Agent Skills spec field for exactly this ("additional properties not defined by the spec"; clients ignore it, and frontmatter never enters the model's prompt):

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

A skill whose frontmatter you can't edit (plugin-provided, vendored) simply stays untracked unless you fork it — it still shows up in raw usage ([ADR-0005](adr/0005-drop-sidecar.md)).

## Rules

1. Dimensions form an open key → value map. **No keys are required.**
2. Every value must be a **string or a list of strings**. Nested maps, numbers, and booleans are invalid. (The Agent Skills spec types `metadata` values as strings; lists are our deliberate extension — safe because clients ignore `metadata` content. If a client ever enforces string-only values, we decide a fallback then — see [ADR-0005](adr/0005-drop-sidecar.md).)
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

The **scanner** (`src/scanner/scan.ts`) walks `.claude/skills/*/` in one or more roots — reading each skill's frontmatter `metadata` — and exports the merged **metadata map** (skill name → dimensions). Where the skills live (monorepo, dedicated repo, plugin repo) is the team's choice, not the format's. The **dashboard** joins that map against OTEL usage data on `skill.name` to render usage overall, per dimension value, and per person.

```console
$ node src/scanner/cli.ts --root examples/repo               # the metadata map, as JSON
$ node src/scanner/cli.ts --root examples/repo --format prom # Phase 1 Grafana adapter
```

The map is a **contract, not a scanner detail**: anything that emits the same shape keyed by real `skill.name`s is a legitimate metadata source ([ADR-0003](adr/0003-frontmatter-metadata.md) — e.g. a CMS adapter, or app-side tagging later). The scanner is source #1, the one every team with a git repo already has.

### The JSON export shape

What the scanner actually writes is the map inside an export document — provenance around the entries:

```json
{
  "version": 1,
  "roots": ["/abs/path/scanned"],
  "skills": {
    "ticket-planner": {
      "name": "ticket-planner",
      "dimensions": { "category": "plan", "tags": ["experimental"] },
      "source": "examples/repo/.claude/skills/ticket-planner/SKILL.md"
    }
  }
}
```

Each `skills` entry's `dimensions` is the map value for that key; `version`, `roots`, and the per-entry `name`/`source` are bookkeeping, not dimensions. Consumers accept this export **and** the bare `skill name → dimensions` object — the boundary shape above — discriminated by the numeric `version` (in a bare map, `version: 1` would be an invalid dimensions value). A non-scanner source may emit either; wield-app's parser accepts both (its `src/metadata/decisions/0002-accept-scanner-export.md`) and pins the export shape with a checked-in fixture of real scanner output.

Two skills sharing one name across roots cannot be told apart by telemetry, so the scanner keeps the first and warns. A skill with no dimensions is simply untracked: still counted in overall usage, just carrying no dimensions.
