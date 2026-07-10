# meta.yaml — the skill tracking sidecar

**Status:** v1 draft (2026-07-10)

`meta.yaml` is an optional YAML file placed inside a Claude Code skill folder, next to `SKILL.md`:

```
.claude/skills/ticket-planner/
  SKILL.md
  meta.yaml
```

Its **presence opts the skill into enriched tracking**. Skills without one are still usage-tracked by telemetry (per-skill `skill.name` on cost/token metrics — verified live 2026-07-10; `skill_activated` events also fire but mask custom skill names to `custom_skill`, see `otel/README.md`); they just carry no dimensions to group by.

## Rules

1. The file is an open key → value map. **No keys are required.**
2. Every value must be a **string or a list of strings**. Nested maps, numbers, and booleans are invalid.
3. Keys are **dimensions**: team-defined vocabulary. The format reserves nothing; the conventions below are suggestions.
4. Tooling never edits `SKILL.md`. All tracking metadata lives here.
5. Unknown keys are never errors. Consumers ignore what they don't understand.

## The shape of a value decides how it can be used

This is the one rule worth internalising, and it applies to **every key** — the format still reserves none.

| Shape | Is a | The dashboard can |
|---|---|---|
| **Scalar** — `category: plan` | partition | **group** by it. Every skill lands in exactly one bucket, so the buckets sum to the total. |
| **List** — `tags: [experimental, slow]` | set | **filter** by it. A skill can be in many buckets at once, so grouping would double-count. |

Reach for a list only when a skill genuinely belongs to several values at once. If every skill has exactly one value for a key, make it scalar and you get a chart you can group by. This is why `category` is a scalar: `category: [plan, review]` is not a skill in a "plan and review" bucket, it's a skill counted twice.

The dashboard mechanics that follow from this — and why a list can't simply be a Prometheus label — are in [ADR-0002](adr/0002-query-time-join.md).

## Conventional keys

| Key | Shape | Meaning |
|---|---|---|
| `category` | scalar | Where the skill fits in the team's chosen taxonomy. Lifecycle stages (`spec`, `plan`, `implement`, `test`, `review`) are one common scheme — the format doesn't care which you pick. Agnostic skills omit it. |
| `author` | scalar | Who wrote/owns the skill. |
| `tags` | list | Free-form set membership: `experimental`, `slow`, `needs-review`. The catch-all for anything a skill can be several of. |
| `invokes` | list | Other skills this one invokes (documented intent; reserved for future tooling). |
| `forked_from` | scalar | Provenance, if adapted from another skill (reserved for future tooling). |

## Example

```yaml
category: plan
author: sarah
tags: [experimental]
invokes: [grill-me]
```

The skill's name — the key everything joins on — is **not** in this file. It comes from the `name` in the sibling `SKILL.md` frontmatter, because that is what Claude Code reports as `skill.name` in telemetry. The scanner warns when it disagrees with the folder name.

## Vocabulary drift

Free-form values can drift (`plan` vs `planning`), which fragments dashboard groupings. Planned mitigations, both optional: a lint that warns on near-duplicate values across a repo, and a vocab file for teams that want strict validation. Flexible by default, strict by choice.

## How it's consumed

The **scanner** (`src/scan.ts`) walks `.claude/skills/*/meta.yaml` in one or more roots and exports the merged **metadata map** (skill name → dimensions) — where the skills live (monorepo, dedicated repo, plugin repo) is the team's choice, not the format's. The **dashboard** joins that map against OTEL usage data on `skill.name` to render usage overall, per dimension value, and per person.

```console
$ node src/cli.ts --root examples/repo              # the metadata map, as JSON
$ node src/cli.ts --root examples/repo --format prom # Phase 1 Grafana adapter
```

Two skills sharing one name across roots cannot be told apart by telemetry, so the scanner keeps the first and warns. A skill with no sidecar is simply untracked: still counted in overall usage, just carrying no dimensions.
