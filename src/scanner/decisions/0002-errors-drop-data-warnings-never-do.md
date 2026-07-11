# ADR-0002: Errors drop data; warnings never do

**Status:** accepted (date unrecorded — split out of CONTEXT.md on 2026-07-11)

## Context

The scanner accumulates diagnostics instead of throwing, and the two levels
needed a stable meaning consumers can rely on. Spans the dimension-validation
and rendering criteria.

## Decision

Every `error` corresponds to something excluded from the map or the rendering;
a `warn` output is complete and usable.

## Consequences

Seeing `error` means data was dropped (a key, a skill); seeing only warnings
means the output is whole and something merely deserves attention. This is the
line the exit codes build on ([ADR-0005](0005-exit-codes.md)).
