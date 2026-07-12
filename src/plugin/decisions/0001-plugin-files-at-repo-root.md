# 0001 — Installable plugin files live at the repo root, owned by this slice

Status: accepted

## Context

Claude Code discovers a plugin by its manifest at `.claude-plugin/plugin.json`
and its commands in `commands/`, both at the plugin root — and the plugin root
is the repo root, because the whole repo is what installs (the wrapping
commands need the scanner and push sources present). The Speccle convention
wants everything about a feature inside its folder, and `src/plugin/` cannot
contain files whose location the platform fixes.

## Decision

The installable files sit at the repo root; the plugin slice owns them anyway.
All code, tests, and contract stay in `src/plugin/`, and the slice's tests
reach up to assert the root files' shape (manifest name and version, each
command's entry point and frontmatter). No other slice touches those files.

## Consequences

- The repo root gains `.claude-plugin/` and `commands/` — two entries the
  convention would rather see inside the feature folder, traded for the repo
  being installable as-is.
- Renaming a wrapped CLI entry point (`src/scanner/src/cli.ts`,
  `src/push/src/cli.ts`) breaks a `PLUGIN` test, not a user's installed
  plugin — the drift guard the root placement would otherwise lose.
- A future marketplace repo (ticket's distribution idea) can point at this
  repo unchanged.
