import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("./cli.ts", import.meta.url));
const MANAGED_SETTINGS = fileURLToPath(
  new URL("../../../ops/otel/managed-settings.json", import.meta.url),
);

function run(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  // Strip any real telemetry and push configuration so tests control it entirely.
  const base = Object.fromEntries(
    Object.entries(process.env).filter(
      ([k]) =>
        !k.startsWith("OTEL_") &&
        !k.startsWith("CLAUDE_CODE_") &&
        !k.startsWith("PROM_REMOTE_WRITE_"),
    ),
  ) as Record<string, string>;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { ...base, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolvePromise({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** The telemetry block's variable names, read from the file ops deploys. */
async function telemetryVars(): Promise<string[]> {
  const parsed = JSON.parse(await readFile(MANAGED_SETTINGS, "utf8")) as {
    env: Record<string, string>;
  };
  return Object.keys(parsed.env);
}

test("[PLUGIN-9] doctor reports a status line for every variable in the telemetry block", async () => {
  const vars = await telemetryVars();
  assert.ok(vars.length > 0, "the managed settings file declares an env block");

  const { stdout } = await run([], {
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_METRICS_EXPORTER: "otlp",
  });

  for (const name of vars) {
    assert.match(stdout, new RegExp(`^\\s*${name}: (set|unset)$`, "m"), `a line for ${name}`);
  }
  assert.match(stdout, /^\s*CLAUDE_CODE_ENABLE_TELEMETRY: set$/m);
  assert.match(stdout, /^\s*OTEL_METRICS_EXPORTER: set$/m);
  assert.match(stdout, /^\s*OTEL_LOGS_EXPORTER: unset$/m);
  // Values are never printed — OTEL_EXPORTER_OTLP_HEADERS carries a credential.
  assert.ok(!stdout.includes("otlp\n") || !stdout.includes(": otlp"), "statuses, not values");
});

/** A fake OTLP endpoint answering every request with the given status. */
async function startEndpoint(statusCode = 405) {
  const server = createServer((_req, res) => {
    res.statusCode = statusCode;
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/otlp`,
    close: () =>
      new Promise<void>((r) => {
        server.close(() => {
          r();
        });
      }),
  };
}

/** Env with every telemetry variable set, the endpoint pointing at `url`. */
async function fullTelemetryEnv(url: string): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const name of await telemetryVars()) env[name] = "x";
  env.OTEL_EXPORTER_OTLP_ENDPOINT = url;
  return env;
}

test("[PLUGIN-11] an unset telemetry variable makes the doctor exit 1", async () => {
  const endpoint = await startEndpoint();
  try {
    const full = await fullTelemetryEnv(endpoint.url);

    // Everything set and answering: exit 0, even with no push configuration.
    const healthy = await run([], full);
    assert.equal(healthy.code, 0);

    const oneUnset = { ...full };
    delete oneUnset.OTEL_LOGS_EXPORTER;
    const sick = await run([], oneUnset);
    assert.equal(sick.code, 1);
    assert.match(sick.stdout, /^\s*OTEL_LOGS_EXPORTER: unset$/m);
  } finally {
    await endpoint.close();
  }
});

test("[PLUGIN-10] doctor reports a status line for every push-configuration variable", async () => {
  const { stdout } = await run([], { PROM_REMOTE_WRITE_URL: "http://127.0.0.1:9/x" });
  assert.match(stdout, /^\s*PROM_REMOTE_WRITE_URL: set$/m);
  assert.match(stdout, /^\s*PROM_REMOTE_WRITE_USERNAME: unset$/m);
  assert.match(stdout, /^\s*PROM_REMOTE_WRITE_PASSWORD: unset$/m);
});

test("[PLUGIN-12] doctor probes a set OTLP endpoint and reports whether it answered", async () => {
  // Any HTTP response counts as answered — a 405 proves the host is reachable.
  const endpoint = await startEndpoint(405);
  try {
    const answered = await run([], await fullTelemetryEnv(endpoint.url));
    assert.equal(answered.code, 0);
    assert.match(answered.stdout, /endpoint answered/);
  } finally {
    await endpoint.close();
  }

  // A closed port: reported in one line, never a stack trace, and exit 1.
  const dead = await startEndpoint();
  const deadUrl = dead.url;
  await dead.close();
  const unreachable = await run([], await fullTelemetryEnv(deadUrl));
  assert.equal(unreachable.code, 1);
  assert.match(unreachable.stdout, /endpoint unreachable/);
  const probeLines = unreachable.stdout.split("\n").filter((l) => l.includes("unreachable"));
  assert.equal(probeLines.length, 1);
  assert.doesNotMatch(unreachable.stdout, /^\s+at /m);
  assert.doesNotMatch(unreachable.stderr, /^\s+at /m);

  // No endpoint set, no probe — the unset line already tells the story.
  const noEndpoint = await fullTelemetryEnv("http://ignored");
  delete noEndpoint.OTEL_EXPORTER_OTLP_ENDPOINT;
  const silent = await run([], noEndpoint);
  assert.doesNotMatch(silent.stdout, /answered|unreachable/);
});

/** A temp dir holding a source block and a settings path for --write tests. */
async function writeFixture(sourceEnv: Record<string, string>, settings?: object) {
  const dir = await mkdtemp(join(tmpdir(), "wield-doctor-"));
  const sourcePath = join(dir, "managed-settings.json");
  await writeFile(sourcePath, JSON.stringify({ env: sourceEnv }));
  const settingsPath = join(dir, "settings.json");
  if (settings !== undefined) await writeFile(settingsPath, JSON.stringify(settings));
  return { sourcePath, settingsPath };
}

const readSettings = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as { env?: Record<string, string> } & Record<
    string,
    unknown
  >;

test("[PLUGIN-13] --write merges the telemetry block into the settings file", async () => {
  const block = { CLAUDE_CODE_ENABLE_TELEMETRY: "1", OTEL_METRICS_EXPORTER: "otlp" };

  // A missing settings file is created.
  const fresh = await writeFixture(block);
  const created = await run([
    "--write",
    "--source",
    fresh.sourcePath,
    "--settings",
    fresh.settingsPath,
  ]);
  assert.equal(created.code, 0);
  assert.deepEqual((await readSettings(fresh.settingsPath)).env, block);

  // Unrelated top-level keys survive untouched.
  const existing = await writeFixture(block, { model: "opus", env: {} });
  const merged = await run([
    "--write",
    "--source",
    existing.sourcePath,
    "--settings",
    existing.settingsPath,
  ]);
  assert.equal(merged.code, 0);
  const settings = await readSettings(existing.settingsPath);
  assert.equal(settings.model, "opus");
  assert.deepEqual(settings.env, block);
});

test("[PLUGIN-14] --write never overwrites an env value already present in the settings file", async () => {
  const block = { CLAUDE_CODE_ENABLE_TELEMETRY: "1", OTEL_METRICS_EXPORTER: "otlp" };
  const fixture = await writeFixture(block, {
    env: { CLAUDE_CODE_ENABLE_TELEMETRY: "0", UNRELATED: "keep" },
  });

  const { code, stdout } = await run([
    "--write",
    "--source",
    fixture.sourcePath,
    "--settings",
    fixture.settingsPath,
  ]);
  assert.equal(code, 0);
  assert.deepEqual((await readSettings(fixture.settingsPath)).env, {
    CLAUDE_CODE_ENABLE_TELEMETRY: "0", // the customised value survives
    UNRELATED: "keep",
    OTEL_METRICS_EXPORTER: "otlp", // only the missing key is added
  });
  // The report says which keys were added and which were left alone.
  assert.match(stdout, /added: OTEL_METRICS_EXPORTER/);
  assert.match(stdout, /left alone: CLAUDE_CODE_ENABLE_TELEMETRY/);
});

test("[PLUGIN-15] a REPLACE_ME placeholder in the source block aborts the write", async () => {
  const fixture = await writeFixture({
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_EXPORTER_OTLP_ENDPOINT: "REPLACE_ME: e.g. https://otlp-gateway.example/otlp",
    OTEL_RESOURCE_ATTRIBUTES: "team.id=REPLACE_ME",
  });

  const { code, stderr } = await run([
    "--write",
    "--source",
    fixture.sourcePath,
    "--settings",
    fixture.settingsPath,
  ]);
  assert.equal(code, 1);
  // The complaint names each placeholder variable, and only those.
  assert.ok(stderr.includes("OTEL_EXPORTER_OTLP_ENDPOINT"));
  assert.ok(stderr.includes("OTEL_RESOURCE_ATTRIBUTES"));
  assert.ok(!stderr.includes("CLAUDE_CODE_ENABLE_TELEMETRY"));
  // The settings file is not touched.
  await assert.rejects(readFile(fixture.settingsPath));

  // The repo's own block ships with placeholders, so a default-source write
  // refuses out of the box.
  const defaultSource = await run(["--write", "--settings", fixture.settingsPath]);
  assert.equal(defaultSource.code, 1);
  await assert.rejects(readFile(fixture.settingsPath));
});

test("[PLUGIN-16] --help prints usage and exits 0", async () => {
  const { code, stdout } = await run(["--help"]);
  assert.equal(code, 0);
  assert.match(stdout, /wield doctor/);
  assert.match(stdout, /--write/);
});

test("[PLUGIN-17] an unrecognised flag exits 2 with the complaint on stderr", async () => {
  const unknownFlag = await run(["--wirte"]);
  assert.equal(unknownFlag.code, 2);
  assert.equal(unknownFlag.stdout, "");
  assert.match(unknownFlag.stderr, /--wirte/);
  assert.doesNotMatch(unknownFlag.stderr, /^\s+at /m); // a complaint, not a stack trace

  const missingValue = await run(["--settings"]);
  assert.equal(missingValue.code, 2);
  assert.match(missingValue.stderr, /--settings/);
  assert.doesNotMatch(missingValue.stderr, /^\s+at /m);
});
