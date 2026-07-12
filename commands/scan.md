---
description: Export this project's skill metadata map (the Wield scanner)
---

Run the Wield scanner over this project and report what it found.

1. The scanner needs its dependencies once per install: if
   `${CLAUDE_PLUGIN_ROOT}/node_modules` is missing, run
   `npm install --prefix "${CLAUDE_PLUGIN_ROOT}" --omit=dev` first.
2. Run:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/src/scanner/src/cli.ts"
   ```

   The invocation directory is the only root scanned by default; pass
   `--root <path>` (repeatable) to scan elsewhere, or `--format prom` for the
   Prometheus info-metric rendering instead of JSON.

3. Show the metadata map and explain any diagnostics (stderr,
   `level: file: message`). Exit 1 means an error diagnostic dropped data;
   untracked skills are skipped silently by design — a skill opts in by
   carrying a `metadata` field in its `SKILL.md` frontmatter (`/wield:init`
   scaffolds it).
