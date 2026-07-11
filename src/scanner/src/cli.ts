#!/usr/bin/env node
/**
 * wield scan — export the metadata map from one or more roots.
 *
 *   node src/scanner/src/cli.ts                          # JSON map for the current repo
 *   node src/scanner/src/cli.ts --root . --root ../infra # merge several roots
 *   node src/scanner/src/cli.ts --format prom            # Prometheus info metrics
 *   node src/scanner/src/cli.ts --strict                 # warnings become a failing exit
 */

import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import type { Diagnostic } from "./format.ts";
import { renderInfoMetrics } from "./prom.ts";
import { scan } from "./scan.ts";

const USAGE = `wield scan — export the skill metadata map

Options:
  --root <path>    Root to scan for .claude/skills (repeatable, default: cwd)
  --format <fmt>   json (default) or prom
  --out <path>     Write to a file instead of stdout
  --strict         Exit non-zero on warnings as well as errors
  --help           Show this message
`;

const { values } = parseArgs({
  options: {
    root: { type: "string", multiple: true, default: [] },
    format: { type: "string", default: "json" },
    out: { type: "string" },
    strict: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}

if (values.format !== "json" && values.format !== "prom") {
  process.stderr.write(`unknown --format "${values.format}": expected json or prom\n`);
  process.exit(2);
}

const roots = values.root.length > 0 ? values.root : [process.cwd()];
const { map, diagnostics } = await scan(roots);

let output: string;
if (values.format === "prom") {
  const rendered = renderInfoMetrics(map);
  diagnostics.push(...rendered.diagnostics);
  output = rendered.text;
} else {
  output = `${JSON.stringify(map, null, 2)}\n`;
}

const report = (d: Diagnostic) => process.stderr.write(`${d.level}: ${d.file}: ${d.message}\n`);
diagnostics.forEach(report);

if (values.out) await writeFile(values.out, output);
else process.stdout.write(output);

const errors = diagnostics.filter((d) => d.level === "error").length;
const warnings = diagnostics.length - errors;
if (errors > 0 || (values.strict && warnings > 0)) process.exit(1);
