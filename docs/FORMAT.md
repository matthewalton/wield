# meta.yaml — the skill tracking sidecar

**Status:** v1 draft (2026-07-10)

`meta.yaml` is an optional YAML file placed inside a Claude Code skill folder, next to `SKILL.md`:

```
.claude/skills/ticket-planner/
  SKILL.md
  meta.yaml
```

Its **presence opts the skill into enriched tracking**. Skills without one are still usage-tracked by telemetry (every invocation emits `claude_code.skill_activated` with `skill.name`); they just carry no dimensions to group by.

## Rules

1. The file is an open key → value map. **No keys are required.**
2. Every value must be a **string or a list of strings** — this keeps every key groupable by the dashboard. Nested maps, numbers, and booleans are invalid.
3. Keys are **dimensions**: team-defined vocabulary. The format reserves nothing; the conventions below are suggestions.
4. Tooling never edits `SKILL.md`. All tracking metadata lives here.
5. Unknown keys are never errors. Consumers ignore what they don't understand.

## Conventional keys

| Key | Meaning |
|---|---|
| `category` | Where the skill fits in the team's chosen taxonomy. Lifecycle stages (`spec`, `plan`, `implement`, `test`, `review`) are one common scheme — the format doesn't care which you pick. Agnostic skills omit it. |
| `author` | Who wrote/owns the skill. |
| `invokes` | Other skills this one invokes (documented intent; reserved for future tooling). |
| `forked_from` | Provenance, if adapted from another skill (reserved for future tooling). |

## Example

```yaml
category: [plan]
author: sarah
invokes: [grill-me]
```

## Vocabulary drift

Free-form values can drift (`plan` vs `planning`), which fragments dashboard groupings. Planned mitigations, both optional: a lint that warns on near-duplicate values across a repo, and a vocab file for teams that want strict validation. Flexible by default, strict by choice.

## How it's consumed

The **scanner** walks `.claude/skills/*/meta.yaml` and exports the **metadata map** (skill name → dimensions). The **dashboard** joins that map against OTEL usage data on `skill.name` to render usage overall, per dimension value, and per person.
