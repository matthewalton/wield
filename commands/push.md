---
description: Push this machine's skill metadata to the team metrics store (wield push)
---

Deliver this machine's skill metadata map to the team's metrics store — the
local counterpart of the CI delivery leg.

1. If `${CLAUDE_PLUGIN_ROOT}/node_modules` is missing, run
   `npm install --prefix "${CLAUDE_PLUGIN_ROOT}" --omit=dev` first.
2. A real push needs the push configuration in the environment:
   `PROM_REMOTE_WRITE_URL`, `PROM_REMOTE_WRITE_USERNAME` (the stack's numeric
   instance ID), `PROM_REMOTE_WRITE_PASSWORD` (an access-policy token). If any
   are missing, suggest `--dry-run` — it needs none — or `/wield:doctor` to see
   what is missing.
3. Run:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/src/push/src/cli.ts"
   ```

   The invocation directory is the only root scanned by default; pass
   `--root <path>` (repeatable, e.g. `--root ~` for personal skills) to push
   from elsewhere, `--dry-run` to print what would be delivered without
   sending.

4. Report the outcome from stderr: the pushed series count and endpoint on
   success; on failure the store's own complaint — relay it verbatim, it names
   the cause (bad auth, out-of-order samples).
