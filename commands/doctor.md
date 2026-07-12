---
description: Diagnose this machine's skill-tracking setup — telemetry and push status
---

Diagnose whether this machine is set up for skill tracking: is Claude Code
configured to export usage telemetry, and can this machine push metadata?

1. Run:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/src/plugin/src/cli.ts"
   ```

2. Explain the report: the telemetry block section says whether Claude Code
   on this machine exports usage (any `unset` line, or an unreachable OTLP
   endpoint, makes the exit 1); the push configuration section is
   informational — a person on the CI delivery leg legitimately has none of
   it set.

3. If telemetry variables are unset, offer the fix paths: team machines get
   the block via managed settings (an ops step, see
   `${CLAUDE_PLUGIN_ROOT}/ops/otel/README.md`); an individual can merge the
   block into their own `~/.claude/settings.json` with:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/src/plugin/src/cli.ts" --write
   ```

   (`--write` never overwrites a value already present, and refuses a source
   block still carrying `REPLACE_ME` placeholders — the team's fork fills
   those in `ops/otel/managed-settings.json`.)
