# Plugin — working the slice

The plugin slice packages Wield as a Claude Code plugin: the manifest and
commands at the repo root (`.claude-plugin/plugin.json`, `commands/*.md`) are
owned and tested from here, and the doctor — the per-machine diagnostic CLI —
lives in this slice's `src/`.

## Commands

```sh
node --test 'src/plugin/src/*.test.ts'   # this slice's tests only
npm test                                 # whole-project suite
npm run doctor                           # telemetry + push-config status
npm run doctor -- --write                # merge the telemetry block into ~/.claude/settings.json
```

Run from the repo root. No build step — Node executes the TypeScript directly.
The doctor reads only the environment and `ops/otel/managed-settings.json`;
`--write` touches the settings file, so tests always pass `--settings` (and
usually `--source`) to stay inside a temp directory.

## The contract

- `SPEC.md` — the acceptance criteria; tests claim a criterion by carrying its
  `[PLUGIN-n]` token in the full test name.
- `CONTEXT.md` — the slice's language; the repo glossary
  ([../../CONTEXT.md](../../CONTEXT.md)) and the push slice's
  ([../push/CONTEXT.md](../push/CONTEXT.md)) own the shared words.
- `decisions/` — the slice's ADRs, one file per decision.

Code and tests live in `src/`, tests beside the code they defend. The
installable plugin files sit at the repo root — the platform fixes their
location — but changes to them belong to this slice
([decisions/0001](decisions/0001-plugin-files-at-repo-root.md)).
