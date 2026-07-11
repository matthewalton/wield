# ADR-0005: Drop the meta.yaml sidecar; frontmatter is the only dimensions home

**Status:** accepted (2026-07-11) — supersedes decision 2 of [ADR-0003](0003-frontmatter-metadata.md)
**Tickets:** —

## Context

ADR-0003 moved dimensions into `SKILL.md` frontmatter and kept the `meta.yaml` sidecar as an override for unowned skills (plugin-provided, vendored). Living with both homes even briefly showed the override costs more than it earns:

1. **Two homes need machinery.** A precedence rule, a wholesale-override warning, "where is this value set?" reasoning in every consumer conversation, and five scanner criteria (SCAN-1/2/4/8/36) existing only to govern the second home.
2. **The case it served is hypothetical.** No unowned skill is tracked today. When one matters, forking it — or leaving it untracked, which still counts in raw usage — covers the need without a parallel format.

## Decision

The `metadata` field in `SKILL.md` frontmatter is the only place dimensions live. The scanner reads nothing else; a `meta.yaml` file in a skill folder is ignored like any other skill asset.

A skill whose frontmatter can't be edited stays untracked, or gets forked. If real demand for annotating unowned skills appears, the metadata-map contract (ADR-0003 decision 3) already admits new sources — a CMS adapter, app-side tagging — so the answer is a deliberate new source, not a sidecar revival.

One loose end this closes differently than ADR-0003 planned: its caveat named the sidecar as the escape hatch should a client ever enforce the spec's string-only typing of `metadata` values (our list-valued dimensions are an extension). That hatch is gone; if the situation ever arises, the fallback is decided then (e.g. a scalar encoding, or an alternative source).

## Consequences

- Scanner: sidecar reading, the precedence rule, and their warnings removed; criteria SCAN-1, SCAN-2, SCAN-4, SCAN-8, and SCAN-36 retired from `src/scanner/SPEC.md`.
- FORMAT.md bumped to v3; CONTEXT.md, CONTRACT.md, README, and PRD amended (2026-07-11).
- `examples/repo`: `ticket-planner`'s dimensions moved into its frontmatter and its `meta.yaml` deleted — both example skills now demonstrate the one home.
