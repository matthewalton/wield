# ADR-0003: First definition wins, deterministically

**Status:** accepted (date unrecorded — split out of CONTEXT.md on 2026-07-11)

## Context

One skill name can be defined in two scanned roots with different dimensions,
and telemetry only carries `skill.name` — the duplicates are indistinguishable
downstream. Spans [SCAN-5] and [SCAN-6].

## Decision

Duplicate skill names are indistinguishable in telemetry, so the scanner keeps
the first and warns rather than guessing or failing.

## Consequences

Merging is deterministic in root order. A duplicate with identical dimensions
is normal vendoring, not a conflict, and produces no diagnostic.
