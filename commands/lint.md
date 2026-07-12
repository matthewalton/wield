---
description: Validate this project's skill tracking metadata — warnings fail (strict scan)
---

Lint this project's skill tracking metadata. Lint is the Wield scanner in
strict mode — the same validation the metadata map gets, with warnings
promoted to failures.

1. If `${CLAUDE_PLUGIN_ROOT}/node_modules` is missing, run
   `npm install --prefix "${CLAUDE_PLUGIN_ROOT}" --omit=dev` first.
2. Run:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/src/scanner/src/cli.ts" --strict --out /dev/null
   ```

   (`--out` keeps the map itself out of the way; the diagnostics on stderr are
   the lint result.)

3. Report the outcome: exit 0 is clean; exit 1 lists what to fix, one
   `level: file: message` line each. Typical findings: a dimension value that
   is not a string or list of strings, a skill name declared twice with
   different dimensions, a declared name differing from its folder. The format
   rules live in `${CLAUDE_PLUGIN_ROOT}/docs/FORMAT.md` — quote the relevant
   rule when explaining a finding.
