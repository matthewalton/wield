# Scanner — working the slice

The scanner walks one or more roots for `.claude/skills/*/` folders, reads
dimensions from the `metadata` field in each skill's `SKILL.md` frontmatter,
and exports the metadata map as JSON or as Prometheus info metrics via the
`wield` CLI.

## Commands

```sh
node --test 'src/scanner/src/*.test.ts'   # this slice's tests only
npm test                                  # whole-project suite
npm run scan                              # run the CLI from source
```

Run from the repo root. No build step — Node executes the TypeScript directly.

## The contract

- `SPEC.md` — the acceptance criteria; tests claim a criterion by carrying its
  `[SCAN-n]` token in the full test name.
- `CONTEXT.md` — the slice's language; the repo glossary
  ([../../CONTEXT.md](../../CONTEXT.md)) owns the domain words.
- `decisions/` — the slice's ADRs, one file per decision.

Code and tests live in `src/`, tests beside the code they defend.
