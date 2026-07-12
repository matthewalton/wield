#!/usr/bin/env node
/**
 * wield push — scan roots and deliver the skill metadata map to the metrics
 * store, the local counterpart of the CI leg (docs/delivery.md).
 *
 *   node src/push/src/cli.ts --root ~        # personal skills, one command
 *   node src/push/src/cli.ts --dry-run       # inspect without sending
 */

import { parseArgs } from "node:util";
import type { Diagnostic } from "../../scanner/src/format.ts";
import { renderInfoMetrics } from "../../scanner/src/prom.ts";
import { scan } from "../../scanner/src/scan.ts";
import { parseExposition } from "./exposition.ts";
import { type WireSeries, encodeWriteRequest } from "./remote-write.ts";

const USAGE = `wield push — scan roots and deliver the skill metadata map to the metrics store

Options:
  --root <path>    Root to scan for .claude/skills (repeatable, default: cwd)
  --dry-run        Print what would be pushed without sending it
  --help           Show this message

Configuration (environment, not needed for --dry-run):
  PROM_REMOTE_WRITE_URL       remote-write push endpoint
  PROM_REMOTE_WRITE_USERNAME  the stack's numeric instance ID
  PROM_REMOTE_WRITE_PASSWORD  access-policy token with metrics:write
`;

function parseCliArgs() {
  try {
    return parseArgs({
      options: {
        root: { type: "string", multiple: true, default: [] },
        "dry-run": { type: "boolean", default: false },
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

const CONFIG_VARS = [
  "PROM_REMOTE_WRITE_URL",
  "PROM_REMOTE_WRITE_USERNAME",
  "PROM_REMOTE_WRITE_PASSWORD",
] as const;

// A dry run needs no push configuration: it lets a teammate inspect the
// delivery before acquiring a token.
const missing = values["dry-run"] ? [] : CONFIG_VARS.filter((name) => !process.env[name]);
if (missing.length > 0) {
  // Misconfiguration is a usage error: exit 2, nothing scanned or sent.
  process.stderr.write(`missing push configuration: set ${missing.join(", ")}\n`);
  process.exit(2);
}

const url = process.env.PROM_REMOTE_WRITE_URL!;
const username = process.env.PROM_REMOTE_WRITE_USERNAME!;
const password = process.env.PROM_REMOTE_WRITE_PASSWORD!;

const roots = values.root.length > 0 ? values.root : [process.cwd()];
const { map, diagnostics } = await scan(roots);
const rendered = renderInfoMetrics(map);
diagnostics.push(...rendered.diagnostics);

const report = (d: Diagnostic) => process.stderr.write(`${d.level}: ${d.file}: ${d.message}\n`);
diagnostics.forEach(report);

// Mirror the CI leg, where a failing scan step blocks the push step:
// partial data is never delivered. Warnings never block.
if (diagnostics.some((d) => d.level === "error")) process.exit(1);

// job="wield" is what the CI leg attaches via promtool --label; panels filter
// on it, so both legs must agree. A dimension named "job" would collide with
// it and is dropped in favour of the fixed value.
const wireSeries: WireSeries[] = parseExposition(rendered.text).map((s) => ({
  labels: [
    ["__name__", s.name] as [string, string],
    ...s.labels.filter(([name]) => name !== "job"),
    ["job", "wield"] as [string, string],
  ],
  value: s.value,
}));

if (wireSeries.length === 0) {
  // Untracked is a legitimate choice (SCAN-35), but a push expects delivery:
  // the likely cause is a misdirected --root.
  process.stderr.write("warn: nothing to push — no tracked skills in the scanned roots\n");
  process.exit(0);
}

if (values["dry-run"]) {
  process.stdout.write(rendered.text);
  process.stderr.write(`dry run: ${wireSeries.length} series would be pushed\n`);
  process.exit(0);
}

const body = encodeWriteRequest(wireSeries, Date.now());
let response: Response;
try {
  response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      "Content-Encoding": "snappy",
      "Content-Type": "application/x-protobuf",
      "X-Prometheus-Remote-Write-Version": "0.1.0",
    },
    body,
  });
} catch (error) {
  // fetch wraps the network error ("fetch failed"); the cause says why.
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const reason = cause instanceof Error ? cause.message : String(cause);
  process.stderr.write(`push failed: ${url}: ${reason}\n`);
  process.exit(1);
}

if (!response.ok) {
  // The body is the store's own complaint (bad auth, out-of-order samples) —
  // swallowing it would leave the user diagnosing blind.
  const detail = (await response.text()).trim();
  process.stderr.write(`push rejected: HTTP ${response.status}${detail ? `: ${detail}` : ""}\n`);
  process.exit(1);
}

process.stderr.write(`pushed ${wireSeries.length} series to ${url}\n`);
