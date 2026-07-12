# ADR-0006: vitest + StrykerJS is the oracle-strength stack; CLI entry files are excluded from mutation

**Status:** accepted (2026-07-12)
**Tickets:** Baton #121

## Context

Speccle's `strengthen` stage measures oracle strength per criterion, which needs
StrykerJS with `coverageAnalysis: "perTest"` — and that coverage analysis needs a
supported test runner (vitest). Wield ran `node --test` with no framework, so every
slice so far (SCAN, PUSH, PLUGIN) ended its pipeline green-but-unmeasured.

A spike on the scanner slice (2026-07-12) settled the open questions:

1. **Conversion cost is one line per file.** Every test used only `test` from
   `node:test` plus `node:assert/strict`; vitest accepts both the `test` signature and
   plain assert. No hooks, mocks, or subtests to migrate.
2. **perTest attribution works** against this suite: 3.04 tests ran per mutant on
   average, and the whole scanner mutation run took 12 seconds.
3. **The spawn-the-CLI test style is a mutation blind spot, confirmed.** All 70
   `cli.ts` mutants came back no-coverage: Stryker activates mutants and collects
   coverage through in-process global state, which never crosses the
   `spawn(process.execPath, …)` boundary. The child runs the instrumented file with no
   active mutant — original behaviour — so CLI tests keep passing and kill nothing.

## Decision

Adopt vitest as the test runner (`npm test` → `vitest run`) and StrykerJS with
`perTest` coverage for mutation (`npm run mutate`), configured in `stryker.conf.json`
at the repo root.

`cli.ts` entry files are excluded from the mutate glob. Their tests are deliberately
subprocess-level (real exit codes, real stdout/stderr — that end-to-end value stays);
including them would only report ~70 no-coverage mutants per slice as noise, implying
work that mutation testing cannot measure under this test style. The blind spot is
recorded here instead of being restated by every strengthen run. CLI files stay thin:
flag parsing and process wiring, with behaviour in the pure modules that are mutated.

If a CLI grows logic worth mutating, the route is moving that logic into a pure module
(or testing an exported `main()` in-process), not widening the glob.

## Consequences

- `strengthen` can now run for real. First scanner numbers: format.ts 88.9%,
  prom.ts 81.0%, scan.ts 68.5% mutation score — survivor routing is follow-up work
  for a strengthen pass, not this ADR.
- The first full run exposed that the push slice scores 0%: its pure modules
  (`exposition.ts`, `remote-write.ts`) are exercised only through spawn-the-CLI
  tests, so every mutant is no-coverage. Fixing that means in-process tests for
  those modules — ticketed as follow-up, not solved here.
- Test files import `test` from `vitest`; assertions stay on `node:assert/strict`.
- `reports/` (Stryker output) and `.stryker-tmp/` are gitignored.
- CLAUDE.md's command list updated (`npm test` is vitest; `npm run mutate` added).
