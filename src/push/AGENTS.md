# Push — working the slice

The push slice delivers the skill metadata map to the metrics store from the
user's machine: it scans roots with the scanner slice, renders the info
metrics, and sends them to a Prometheus remote-write endpoint — the local
counterpart of the CI leg (docs/delivery.md).

## Commands

```sh
node --test 'src/push/src/*.test.ts'   # this slice's tests only
npm test                               # whole-project suite
npm run push -- --root ~              # scan personal skills and push
```

Run from the repo root. No build step — Node executes the TypeScript
directly. A real push needs the push configuration in the environment
(`PROM_REMOTE_WRITE_*`, see docs/delivery.md); `--dry-run` needs nothing.

## The contract

- `SPEC.md` — the acceptance criteria; tests claim a criterion by carrying its
  `[PUSH-n]` token in the full test name.
- `CONTEXT.md` — the slice's language; the repo glossary
  ([../../CONTEXT.md](../../CONTEXT.md)) and the scanner's
  ([../scanner/CONTEXT.md](../scanner/CONTEXT.md)) own the shared words.
- `decisions/` — the slice's ADRs, one file per decision.

Code and tests live in `src/`, tests beside the code they defend.
