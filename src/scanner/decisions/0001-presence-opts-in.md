# ADR-0001: Presence opts in

**Status:** accepted (date unrecorded — split out of CONTEXT.md on 2026-07-11)

## Context

A skill declares dimensions in the `metadata` field of its `SKILL.md`
frontmatter, and the scanner must decide what makes a skill tracked at all.
Spans [SCAN-33], [SCAN-34], and [SCAN-35].

## Decision

The existence of the `metadata` key — not its content — makes a skill tracked.
A bare `metadata:` key is a valid opt-in.

## Consequences

A skill with `metadata:` or `metadata: {}` enters the map with no dimensions
and no diagnostics; a skill without the key is skipped silently — untracked is
a legitimate choice, not an omission.
