---
key: PLUGIN
---

# Plugin

The plugin slice packages Wield as a Claude Code plugin (Baton #89): a manifest
and a set of commands that make onboarding a project into skill tracking a
one-command affair. The installable files — `.claude-plugin/plugin.json` and
`commands/*.md` — live at the repo root where Claude Code discovers them
([decisions/0001](decisions/0001-plugin-files-at-repo-root.md)); this slice
owns them and its tests assert their shape. The doctor, the one command with no
existing CLI to wrap, gets its code here in `src/`. Vocabulary is the repo
glossary ([CONTEXT.md](../../CONTEXT.md)); feature-local terms are in
[CONTEXT.md](CONTEXT.md) beside this spec.

### The plugin surface

## [PLUGIN-1] The plugin manifest declares the plugin name wield

`.claude-plugin/plugin.json` at the repo root — the file Claude Code reads to
install the repo as a plugin. The name is the command namespace: `/wield:scan`,
`/wield:doctor`. The manifest also carries a description; distribution via a
marketplace repo is out of scope (the ticket parks it).

## [PLUGIN-2] The manifest version equals the package.json version

Two files each declaring a version is drift waiting to happen; the test pins
them together so a bump in one place without the other fails.

## [PLUGIN-3] The scan command runs the scanner CLI from the plugin root

`commands/scan.md` invokes `${CLAUDE_PLUGIN_ROOT}/src/scanner/src/cli.ts` —
the installed plugin copy of the scanner, run from the user's project, so the
invocation directory is the only root scanned (SCAN-32). The command body
handles the plugin's dependency install (`npm install` in the plugin root) when
`node_modules` is missing.

## [PLUGIN-4] The lint command runs the scanner CLI with --strict

Lint is the scanner in strict mode, not a second validator: dimension
validation already lives in SCAN-9..13, and `--strict` makes warnings fail
(SCAN-29). A separate linter would drift from the scanner's rules.

## [PLUGIN-5] The push command runs the push CLI from the plugin root

`commands/push.md` invokes `${CLAUDE_PLUGIN_ROOT}/src/push/src/cli.ts`. The
push configuration requirement and failure modes are the push slice's contract
(PUSH-8..11); the command adds nothing on top.

## [PLUGIN-6] The doctor command runs the doctor CLI from the plugin root

`commands/doctor.md` invokes this slice's own CLI (`src/plugin/src/cli.ts`).

## [PLUGIN-7] The init command scaffolds the metadata field in SKILL.md frontmatter, never a sidecar

`commands/init.md` guides an interactive pass over the project's
`.claude/skills/*/`: for each skill the user wants tracked, add a `metadata:`
field with the team's dimensions to the frontmatter already in `SKILL.md`
(SCAN-33). Sidecar files were dropped entirely (docs/adr/0005); the test
asserts the command never mentions one. Untracked stays a legitimate choice
(SCAN-35) — init offers, it does not insist.

## [PLUGIN-8] Every plugin command carries a frontmatter description

The description is what `/help` shows; a command without one is undiscoverable.
The test walks `commands/*.md` so a command added later is covered without a
new criterion.

### The doctor report

## [PLUGIN-9] Doctor reports a status line for every variable in the telemetry block

One line per variable — set or unset — for exactly the keys in
`ops/otel/managed-settings.json`'s `env` map. The test derives the expected
list from that file, so the doctor cannot drift from the block ops deploys.
Values are never printed: `OTEL_EXPORTER_OTLP_HEADERS` carries a credential.

## [PLUGIN-10] Doctor reports a status line for every push-configuration variable

The trio the push slice requires (PUSH-8): `PROM_REMOTE_WRITE_URL`,
`PROM_REMOTE_WRITE_USERNAME`, `PROM_REMOTE_WRITE_PASSWORD`. Reported in its own
section after the telemetry block — a person on the CI leg legitimately has
none of them set.

## [PLUGIN-11] An unset telemetry variable makes the doctor exit 1

Telemetry is the product's spine — no telemetry, no usage. Unset
push-configuration variables never affect the exit: the CI leg delivers
metadata without them. Exit 0 means Claude Code on this machine is configured
to export usage.

## [PLUGIN-12] Doctor probes a set OTLP endpoint and reports whether it answered

Any HTTP response counts as answered — even a 4xx proves the host is
reachable; auth is the exporter's business. A connection failure (refused,
DNS, timeout) is reported in a single line, never a stack trace (the SCAN-36 /
PUSH-11 stance), and makes the exit 1. No endpoint set, no probe — the unset
line from PLUGIN-9 already tells the story.

### The plugin skills section

## [PLUGIN-18] Doctor reports each enabled non-official plugin as masked on metrics

Claude Code reports every skill from a non-official plugin as the literal
`skill.name` `third-party` on cost/token metrics, with no opt-out
(anthropics/claude-code#77541 — the section surfaces that URL so the reader
can track it). Enabled plugins live in the settings file's `enabledPlugins`
map (`"plugin@marketplace": boolean`); the doctor reads the same file
`--settings` overrides for the write (PLUGIN-13), keeping tests out of the
real home directory. One line per plugin. A missing or unreadable settings
file reads as no enabled plugins — one informational line, never a stack
trace (the SCAN-36 / PUSH-11 stance). The detection logic lives in its own
module so mutation measures it (ADR-0006 excludes `cli.ts`).

## [PLUGIN-19] Official-marketplace and disabled plugins produce no masking warning

`claude-plugins-official` skills report verbatim, and a disabled plugin
(`false` in `enabledPlugins`) loads no skills — neither is a masking
problem. Built-in, user, and project skills never appear in
`enabledPlugins` at all.

## [PLUGIN-20] A masking warning never affects the doctor exit code

Masking degrades analytics; it does not break telemetry, and PLUGIN-11 owns
the exit. With nothing to warn about the section prints a single none-line —
the section always appears, matching the report's status-line style.

### The settings write

## [PLUGIN-13] --write merges the telemetry block into the settings file

The individuals' path when managed settings are not deployed: the block from
`ops/otel/managed-settings.json` (overridable with `--source <path>`) lands in
the `env` of `~/.claude/settings.json` (overridable with `--settings <path>`,
which is also how tests stay out of the real home directory). A missing
settings file is created; unrelated top-level keys survive untouched.

## [PLUGIN-14] --write never overwrites an env value already present in the settings file

A person who has customised a variable keeps their value; only missing keys
are added. The report says which keys were added and which were left alone.

## [PLUGIN-15] A REPLACE_ME placeholder in the source block aborts the write

The repo's block ships with `REPLACE_ME` endpoint, headers, and team id — a
team fills them in its own fork. Writing a placeholder into someone's settings
would silently break their exporter: exit 1, the complaint names each
placeholder variable, and the settings file is not touched.

### The doctor CLI surface

## [PLUGIN-16] --help prints usage and exits 0

The SCAN-31 / PUSH-13 stance.

## [PLUGIN-17] An unrecognised flag exits 2 with the complaint on stderr

Covers everything argument parsing rejects, single line, nothing probed and
nothing written — the SCAN-36 / PUSH-14 stance.
