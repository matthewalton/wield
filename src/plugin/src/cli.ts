#!/usr/bin/env node
/**
 * wield doctor — per-machine diagnosis of the skill-tracking setup: is Claude
 * Code configured to export usage telemetry, and can this machine push?
 *
 *   node src/plugin/src/cli.ts             # report status
 *   node src/plugin/src/cli.ts --write     # merge the telemetry block into ~/.claude/settings.json
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const DEFAULT_SOURCE = new URL("../../../ops/otel/managed-settings.json", import.meta.url);

const USAGE = `wield doctor — diagnose this machine's skill-tracking setup

Reports the telemetry block (is Claude Code configured to export usage?),
probes the OTLP endpoint when one is set, and reports the push configuration.
Exit 0 means telemetry is fully configured; push configuration never affects
the exit.

Options:
  --write             Merge the telemetry block into the settings file
  --source <path>     Block to read (default: the plugin's ops/otel/managed-settings.json)
  --settings <path>   Settings file to write (default: ~/.claude/settings.json)
  --help              Show this message
`;

function parseCliArgs() {
  try {
    return parseArgs({
      options: {
        source: { type: "string" },
        settings: { type: "string" },
        write: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

const { values } = parseCliArgs();

if (values.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}

async function readEnvBlock(path: string | URL): Promise<Record<string, string>> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as { env?: Record<string, string> };
  return parsed.env ?? {};
}

if (values.write) {
  const block = await readEnvBlock(values.source ?? DEFAULT_SOURCE);
  const settingsPath = values.settings ?? join(homedir(), ".claude", "settings.json");

  // Writing a placeholder into someone's settings would silently break their
  // exporter — the team's fork fills these in ops/otel/managed-settings.json.
  const placeholders = Object.keys(block).filter((name) => block[name]!.includes("REPLACE_ME"));
  if (placeholders.length > 0) {
    process.stderr.write(
      `source block still has REPLACE_ME placeholders: ${placeholders.join(", ")}\n`,
    );
    process.exit(1);
  }

  let settings: { env?: Record<string, string> } & Record<string, unknown> = {};
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf8")) as typeof settings;
  } catch (error) {
    // A missing settings file is created; anything else (unreadable, corrupt
    // JSON) must not be clobbered by a blind write.
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      const reason = error instanceof Error ? error.message : String(error);
      process.stderr.write(`cannot read ${settingsPath}: ${reason}\n`);
      process.exit(1);
    }
  }

  // A value someone customised is theirs: only missing keys are added.
  const env = settings.env ?? {};
  const added = Object.keys(block).filter((name) => !(name in env));
  const leftAlone = Object.keys(block).filter((name) => name in env);
  for (const name of added) env[name] = block[name]!;
  settings.env = env;

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  process.stdout.write(`wrote ${settingsPath}\n`);
  if (added.length > 0) process.stdout.write(`  added: ${added.join(", ")}\n`);
  if (leftAlone.length > 0) process.stdout.write(`  left alone: ${leftAlone.join(", ")}\n`);
  process.exit(0);
}

const telemetryBlock = await readEnvBlock(values.source ?? DEFAULT_SOURCE);

// Statuses only, never values: OTEL_EXPORTER_OTLP_HEADERS carries a credential.
const status = (name: string) => `  ${name}: ${process.env[name] ? "set" : "unset"}\n`;

process.stdout.write("telemetry block (ops/otel/managed-settings.json):\n");
for (const name of Object.keys(telemetryBlock)) process.stdout.write(status(name));

// Probe a set endpoint: any HTTP response proves the host reachable — even a
// 4xx; auth is the exporter's business. No endpoint set, no probe.
let probeFailed = false;
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
if (endpoint) {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    process.stdout.write(`  endpoint answered (HTTP ${response.status})\n`);
  } catch (error) {
    // fetch wraps the network error ("fetch failed"); the cause says why.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    const reason = cause instanceof Error ? cause.message : String(cause);
    process.stdout.write(`  endpoint unreachable: ${reason}\n`);
    probeFailed = true;
  }
}

// The trio the push slice requires (PUSH-8). Informational only: a person on
// the CI delivery leg legitimately has none of them set.
const PUSH_CONFIG_VARS = [
  "PROM_REMOTE_WRITE_URL",
  "PROM_REMOTE_WRITE_USERNAME",
  "PROM_REMOTE_WRITE_PASSWORD",
];
process.stdout.write("push configuration:\n");
for (const name of PUSH_CONFIG_VARS) process.stdout.write(status(name));

// Telemetry is the product's spine: exit 0 means Claude Code on this machine
// is configured to export usage. Push configuration never affects the exit —
// the CI leg delivers metadata without it.
const telemetryUnset = Object.keys(telemetryBlock).filter((name) => !process.env[name]);
process.exit(telemetryUnset.length > 0 || probeFailed ? 1 : 0);
