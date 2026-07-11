# ADR-0004: One skill_meta row per skill is an invariant

**Status:** accepted (date unrecorded — split out of CONTEXT.md on 2026-07-11)

## Context

Dashboards join telemetry to the metadata map with PromQL `group_left`, which
errors out entirely when the metadata side has two rows for one `skill_name`.
The repo-level [ADR-0002](../../../docs/adr/0002-query-time-join.md) sets the
join architecture. Spans [SCAN-14] through [SCAN-18].

## Decision

`group_left` fails on duplicate right-hand rows, so scalars and sets render as
different metrics rather than different labels.

## Consequences

Grouping dimensions become `skill_meta` labels; set dimensions fan out to
`skill_tag` and never appear on `skill_meta`. Every tracked skill emits exactly
one `skill_meta` series, keeping joins safe and skills discoverable.
