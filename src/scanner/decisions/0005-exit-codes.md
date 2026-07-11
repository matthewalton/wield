# ADR-0005: Exit codes — 0 clean, 1 diagnostics exceeded tolerance, 2 usage error

**Status:** accepted (date unrecorded — split out of CONTEXT.md on 2026-07-11)

## Context

The CLI needed exit semantics that keep partial output useful in pipelines
while still failing loudly. Spans [SCAN-26], [SCAN-28], and [SCAN-29].

## Decision

Exit codes: 0 clean, 1 diagnostics exceeded tolerance, 2 usage error.
`--strict` lowers the tolerance to zero warnings; output is still written
before a failing exit.

## Consequences

A partial map plus a failing exit, never silence. Without `--strict`, warnings
are informational and the exit stays 0; exit 2 means nothing was scanned at
all.
