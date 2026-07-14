# Plugin — feature context

The project glossary ([../../CONTEXT.md](../../CONTEXT.md)) owns the domain
words — skill, tracked skill, dimension, metadata map. The push slice's
glossary ([../push/CONTEXT.md](../push/CONTEXT.md)) owns push configuration.
This file adds only what is local to the plugin slice.

## Terms

**Plugin**:
The installable Claude Code packaging of this repo: the manifest at
`.claude-plugin/plugin.json` plus the commands in `commands/`, both at the
repo root. Installing it gives a project the `/wield:*` commands.
_Avoid_: extension, marketplace entry

**Wrapping command**:
A plugin command whose body runs an existing Wield CLI unchanged — scan, lint,
push, doctor. The wrapped CLI's contract stays where it is (SCAN, PUSH); the
command adds discovery, not behaviour.
_Avoid_: alias, shim, wrapper skill

**Doctor**:
The per-machine diagnostic CLI (`src/plugin/src/cli.ts`): reports
telemetry-block and push-configuration status, probes the OTLP endpoint, and
can merge the telemetry block into the settings file with `--write`.
_Avoid_: healthcheck, status command

**Telemetry block**:
The `env` map in `ops/otel/managed-settings.json` — the variables Claude Code
needs to export usage telemetry. Distinct from the push configuration, which
authenticates the push slice's delivery.
_Avoid_: env block, OTEL settings, telemetry config

**Settings file**:
The per-user `~/.claude/settings.json` that `--write` merges into — the
individuals' path when managed settings are not deployed machine-wide. Also
where the doctor reads `enabledPlugins` for the plugin skills section.
_Avoid_: user settings, global settings

**Non-official plugin**:
An installed plugin whose marketplace is not `claude-plugins-official`.
Claude Code masks its skills to the literal `third-party` on cost/token
metrics (anthropics/claude-code#77541), so its usage cannot be attributed
per skill.
_Avoid_: third-party plugin (the metric literal, not a category), community
plugin
