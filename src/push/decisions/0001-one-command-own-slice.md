# 0001 — Push is its own slice, and one command scans and sends

**Status:** Accepted (2026-07-12)

## Context

Personal skills live in `~/.claude/skills`, which no CI ever checks out, so
the CI delivery leg (docs/delivery.md) cannot see them. Requiring every
teammate to create a skills repo plus workflow plus secrets just to get their
personal skills on the dashboard is adoption friction (Baton #117). The repo
glossary deliberately keeps the scanner pure: "it stores nothing and touches
no network".

## Decision

Local delivery is a new slice (`src/push/`, key PUSH) rather than an
amendment to the scanner:

- The scanner's contract keeps its purity — the push slice imports `scan` and
  `renderInfoMetrics` across the slice boundary and owns everything from
  rendered series to metrics store.
- One command does scan-and-send. There is no file-based handoff (no "render
  to a file, then push the file"): the teammate story is a single invocation,
  and the rendered text stays inspectable via `--dry-run` and the scanner
  CLI's `--format prom`.
- The CLI surface mirrors the scanner's conventions (stderr diagnostics,
  exit 0/1/2 classes) so the two commands feel like one tool.

## Consequences

- The scanner slice is untouched; its "no network" stance survives.
- Wire compatibility with the CI leg (`promtool push metrics`) is this
  slice's responsibility: same series shapes, `job="wield"`, push-time
  timestamps.
- docs/delivery.md and the root glossary's "Delivery … is CI's job" wording
  now under-describe delivery: both gain the local leg when this slice lands.
- CI migration off `promtool` onto this command becomes possible later, but
  is deliberately not part of the slice.
