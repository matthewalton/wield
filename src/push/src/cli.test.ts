import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("./cli.ts", import.meta.url));

function run(
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  // Strip any real push configuration so tests control it entirely.
  const base = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("PROM_REMOTE_WRITE_")),
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

/** Build a throwaway root containing `.claude/skills/<folder>/SKILL.md`. */
async function root(skills: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wield-push-"));
  for (const [folder, skillMd] of Object.entries(skills)) {
    const skillDir = join(dir, ".claude", "skills", folder);
    await mkdir(skillDir, { recursive: true });
    await writeFile(join(skillDir, "SKILL.md"), skillMd);
  }
  return dir;
}

/** SKILL.md whose frontmatter carries a `metadata` block (raw YAML, indented). */
const tracked = (name: string, metadata = "") =>
  `---\nname: ${name}\ndescription: x\nmetadata:\n${metadata}---\n\n# ${name}\n`;

/** A fake metrics store: records every request, answers with the given status. */
async function startStore(status = 200, responseBody = "") {
  const received: { headers: IncomingHttpHeaders; body: Buffer }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks) });
      res.statusCode = status;
      res.end(responseBody);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api/prom/push`,
    received,
    close: () =>
      new Promise<void>((r) => {
        server.close(() => {
          r();
        });
      }),
  };
}

const pushEnv = (url: string) => ({
  PROM_REMOTE_WRITE_URL: url,
  PROM_REMOTE_WRITE_USERNAME: "123456",
  PROM_REMOTE_WRITE_PASSWORD: "glc_test_token",
});

// --- Independent wire decoders, written from the format specs (snappy block
// format; prometheus prompb). They verify conformance rather than mirroring
// the encoder: the snappy decoder handles copy elements the encoder never emits.

function snappyUncompress(buf: Buffer): Buffer {
  let pos = 0;
  let length = 0;
  let shift = 0;
  for (;;) {
    const byte = buf[pos++]!;
    length |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  const out = Buffer.alloc(length);
  let o = 0;
  while (pos < buf.length) {
    const tag = buf[pos++]!;
    const type = tag & 3;
    if (type === 0) {
      let len = tag >>> 2;
      if (len >= 60) {
        const extraBytes = len - 59;
        len = buf.readUIntLE(pos, extraBytes);
        pos += extraBytes;
      }
      len += 1;
      buf.copy(out, o, pos, pos + len);
      pos += len;
      o += len;
    } else {
      let len: number;
      let offset: number;
      if (type === 1) {
        len = ((tag >>> 2) & 7) + 4;
        offset = ((tag >>> 5) << 8) | buf[pos++]!;
      } else if (type === 2) {
        len = (tag >>> 2) + 1;
        offset = buf.readUInt16LE(pos);
        pos += 2;
      } else {
        len = (tag >>> 2) + 1;
        offset = buf.readUInt32LE(pos);
        pos += 4;
      }
      for (let i = 0; i < len; i++) {
        out[o] = out[o - offset]!;
        o += 1;
      }
    }
  }
  assert.equal(o, length, "snappy stream did not fill its declared length");
  return out;
}

interface DecodedSeries {
  /** Label pairs in wire order, so tests can assert protocol-required sorting. */
  labelPairs: [string, string][];
  labels: Record<string, string>;
  samples: { value: number; timestamp: number }[];
}

function decodeWriteRequest(buf: Buffer): DecodedSeries[] {
  let pos = 0;
  const varint = (): number => {
    let value = 0;
    let shift = 0;
    for (;;) {
      const byte = buf[pos++]!;
      value += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return value;
      shift += 7;
    }
  };
  const decodeLabel = (end: number): [string, string] => {
    let name = "";
    let value = "";
    while (pos < end) {
      const tag = varint();
      const len = varint();
      const text = buf.toString("utf8", pos, pos + len);
      pos += len;
      if (tag === 0x0a) name = text;
      else if (tag === 0x12) value = text;
      else assert.fail(`unexpected Label field tag ${tag}`);
    }
    return [name, value];
  };
  const decodeSample = (end: number): { value: number; timestamp: number } => {
    let value = 0;
    let timestamp = 0;
    while (pos < end) {
      const tag = varint();
      if (tag === 0x09) {
        value = buf.readDoubleLE(pos);
        pos += 8;
      } else if (tag === 0x10) {
        timestamp = varint();
      } else assert.fail(`unexpected Sample field tag ${tag}`);
    }
    return { value, timestamp };
  };
  const decodeSeries = (end: number): DecodedSeries => {
    const labelPairs: [string, string][] = [];
    const samples: { value: number; timestamp: number }[] = [];
    while (pos < end) {
      const tag = varint();
      const len = varint();
      if (tag === 0x0a) labelPairs.push(decodeLabel(pos + len));
      else if (tag === 0x12) samples.push(decodeSample(pos + len));
      else assert.fail(`unexpected TimeSeries field tag ${tag}`);
    }
    return { labelPairs, labels: Object.fromEntries(labelPairs), samples };
  };

  const series: DecodedSeries[] = [];
  while (pos < buf.length) {
    const tag = varint();
    assert.equal(tag, 0x0a, "expected a WriteRequest.timeseries field");
    const len = varint();
    series.push(decodeSeries(pos + len));
  }
  return series;
}

const decodePush = (body: Buffer): DecodedSeries[] => decodeWriteRequest(snappyUncompress(body));

test("[PUSH-2] an error diagnostic from the scan aborts before any request is sent", async () => {
  // A numeric dimension value is invalid and dropped with an error (SCAN-10).
  const dir = await root({ broken: tracked("broken", "  cost: 3\n") });
  const store = await startStore();
  try {
    const { code, stderr } = await run(["--root", dir], pushEnv(store.url));
    assert.equal(code, 1);
    assert.match(stderr, /^error: /m);
    assert.equal(store.received.length, 0);
  } finally {
    await store.close();
  }
});

test("[PUSH-3] a scan yielding no tracked skills sends no request", async () => {
  // A skill without a metadata field is untracked (SCAN-35): an empty map.
  const untracked = `---\nname: plain\ndescription: x\n---\n\n# plain\n`;
  const dir = await root({ plain: untracked });
  const store = await startStore();
  try {
    const { code, stderr } = await run(["--root", dir], pushEnv(store.url));
    assert.equal(code, 0);
    assert.match(stderr, /nothing to push/);
    assert.equal(store.received.length, 0);
  } finally {
    await store.close();
  }
});

test("[PUSH-4] the push sends the series as a snappy-compressed protobuf WriteRequest", async () => {
  const dir = await root({ planner: tracked("planner", "  category: plan\n") });
  const store = await startStore();
  try {
    const { code } = await run(["--root", dir], pushEnv(store.url));
    assert.equal(code, 0);
    const { headers, body } = store.received[0]!;
    assert.equal(headers["content-encoding"], "snappy");
    assert.equal(headers["content-type"], "application/x-protobuf");
    assert.equal(headers["x-prometheus-remote-write-version"], "0.1.0");

    // The body decodes per the two format specs, and each series' labels
    // arrive sorted by name as the protocol requires.
    const series = decodePush(body);
    assert.ok(series.length > 0);
    for (const s of series) {
      const names = s.labelPairs.map(([name]) => name);
      assert.deepEqual(names, [...names].sort());
    }
  } finally {
    await store.close();
  }
});

test('[PUSH-5] every pushed series carries a job="wield" label', async () => {
  const dir = await root({
    planner: tracked("planner", "  category: plan\n  tags: [experimental]\n"),
  });
  const store = await startStore();
  try {
    await run(["--root", dir], pushEnv(store.url));
    const series = decodePush(store.received[0]!.body);
    assert.ok(series.length > 0);
    for (const s of series) assert.equal(s.labels.job, "wield");
  } finally {
    await store.close();
  }
});

test("[PUSH-6] all samples in one push carry the same push-time millisecond timestamp", async () => {
  const dir = await root({
    planner: tracked("planner", "  category: plan\n  tags: [experimental]\n"),
    reviewer: tracked("reviewer", "  category: review\n"),
  });
  const store = await startStore();
  try {
    const before = Date.now();
    await run(["--root", dir], pushEnv(store.url));
    const after = Date.now();
    const timestamps = decodePush(store.received[0]!.body).map((s) => s.samples[0]!.timestamp);
    assert.ok(timestamps.length > 1);
    assert.equal(new Set(timestamps).size, 1);
    assert.ok(timestamps[0]! >= before && timestamps[0]! <= after);
  } finally {
    await store.close();
  }
});

test("[PUSH-7] the remote-write request authenticates with HTTP Basic auth built from the push configuration", async () => {
  const dir = await root({ planner: tracked("planner", "  category: plan\n") });
  const store = await startStore();
  try {
    await run(["--root", dir], pushEnv(store.url));
    // username:password paired — the token alone fails auth silently.
    const expected = Buffer.from("123456:glc_test_token").toString("base64");
    assert.equal(store.received[0]!.headers.authorization, `Basic ${expected}`);
  } finally {
    await store.close();
  }
});

test("[PUSH-8] a missing push-configuration variable exits 2 with a complaint naming it", async () => {
  const dir = await root({ planner: tracked("planner", "  category: plan\n") });

  const allMissing = await run(["--root", dir]);
  assert.equal(allMissing.code, 2);
  assert.equal(allMissing.stdout, "");
  for (const name of [
    "PROM_REMOTE_WRITE_URL",
    "PROM_REMOTE_WRITE_USERNAME",
    "PROM_REMOTE_WRITE_PASSWORD",
  ]) {
    assert.ok(allMissing.stderr.includes(name), `complaint names ${name}`);
  }
  // One line, and nothing scanned: no diagnostics follow the complaint.
  assert.equal(allMissing.stderr.trim().split("\n").length, 1);

  const passwordMissing = await run(["--root", dir], {
    PROM_REMOTE_WRITE_URL: "http://127.0.0.1:1/api/prom/push",
    PROM_REMOTE_WRITE_USERNAME: "123456",
  });
  assert.equal(passwordMissing.code, 2);
  assert.ok(passwordMissing.stderr.includes("PROM_REMOTE_WRITE_PASSWORD"));
  assert.ok(!passwordMissing.stderr.includes("PROM_REMOTE_WRITE_USERNAME"));
});

test("[PUSH-9] a successful push reports the pushed series count on stderr", async () => {
  const dir = await root({
    planner: tracked("planner", "  category: plan\n  tags: [experimental]\n"),
    reviewer: tracked("reviewer", "  category: review\n"),
  });
  const store = await startStore();
  try {
    const { code, stdout, stderr } = await run(["--root", dir], pushEnv(store.url));
    assert.equal(code, 0);
    // 2 skill_meta + 1 skill_tag; the report also names the endpoint.
    assert.match(stderr, /pushed 3 series/);
    assert.ok(stderr.includes(store.url));
    assert.equal(stdout, "");
  } finally {
    await store.close();
  }
});

test("[PUSH-10] a rejected push exits 1 with the HTTP status and response body on stderr", async () => {
  const dir = await root({ planner: tracked("planner", "  category: plan\n") });
  const store = await startStore(400, "out of order sample");
  try {
    const { code, stderr } = await run(["--root", dir], pushEnv(store.url));
    assert.equal(code, 1);
    assert.match(stderr, /400/);
    assert.match(stderr, /out of order sample/);
    assert.doesNotMatch(stderr, /pushed \d+ series/);
  } finally {
    await store.close();
  }
});

test("[PUSH-11] a network failure exits 1 with a single-line message on stderr", async () => {
  const dir = await root({ planner: tracked("planner", "  category: plan\n") });
  // Grab a port with nothing listening: bind, note the port, close.
  const store = await startStore();
  const refusedUrl = store.url;
  await store.close();

  const { code, stderr } = await run(["--root", dir], pushEnv(refusedUrl));
  assert.equal(code, 1);
  assert.match(stderr, /push failed/);
  assert.doesNotMatch(stderr, /^\s+at /m); // a message, not a stack trace
});

test("[PUSH-12] --dry-run prints the rendered series without sending a request", async () => {
  const dir = await root({ planner: tracked("planner", "  category: plan\n") });
  const store = await startStore();
  try {
    // The push configuration is deliberately absent: a dry run needs none.
    const { code, stdout, stderr } = await run(["--root", dir, "--dry-run"]);
    assert.equal(code, 0);
    assert.ok(stdout.startsWith("# HELP skill_meta"));
    assert.ok(stdout.includes('skill_meta{skill_name="planner",category="plan"} 1'));
    assert.match(stderr, /1 series/);
    assert.equal(store.received.length, 0);
  } finally {
    await store.close();
  }
});

test("[PUSH-13] --help prints usage and exits 0", async () => {
  const { code, stdout } = await run(["--help"]);
  assert.equal(code, 0);
  assert.match(stdout, /wield push/);
  assert.match(stdout, /--dry-run/);
  assert.match(stdout, /PROM_REMOTE_WRITE_URL/);
});

test("[PUSH-14] an unrecognised flag exits 2 with the complaint on stderr", async () => {
  const unknownFlag = await run(["--rot", "/nope"]);
  assert.equal(unknownFlag.code, 2);
  assert.equal(unknownFlag.stdout, "");
  assert.match(unknownFlag.stderr, /--rot/);
  assert.doesNotMatch(unknownFlag.stderr, /^\s+at /m); // a complaint, not a stack trace

  const missingValue = await run(["--root"]);
  assert.equal(missingValue.code, 2);
  assert.match(missingValue.stderr, /--root/);
  assert.doesNotMatch(missingValue.stderr, /^\s+at /m);
});

test("[PUSH-1] a push sends every series the info-metric rendering emits for the scanned roots", async () => {
  const dir = await root({
    planner: tracked("planner", "  category: plan\n  tags: [experimental, slow]\n"),
    reviewer: tracked("reviewer", "  category: review\n"),
  });
  const store = await startStore();
  try {
    const { code } = await run(["--root", dir], pushEnv(store.url));
    assert.equal(code, 0);
    assert.equal(store.received.length, 1);

    const series = decodePush(store.received[0]!.body);
    // 2 skill_meta (one per skill) + 2 skill_tag (one per tag member).
    assert.equal(series.length, 4);

    const meta = series.filter((s) => s.labels.__name__ === "skill_meta");
    assert.deepEqual(
      new Set(meta.map((s) => s.labels.skill_name)),
      new Set(["planner", "reviewer"]),
    );
    assert.equal(meta.find((s) => s.labels.skill_name === "planner")!.labels.category, "plan");
    assert.equal(meta.find((s) => s.labels.skill_name === "reviewer")!.labels.category, "review");

    const tags = series.filter((s) => s.labels.__name__ === "skill_tag");
    assert.deepEqual(tags.map((s) => s.labels.value).sort(), ["experimental", "slow"]);
    assert.ok(tags.every((s) => s.labels.skill_name === "planner" && s.labels.key === "tags"));

    // Info metrics: every series carries exactly one sample of value 1.
    for (const s of series) {
      assert.equal(s.samples.length, 1);
      assert.equal(s.samples[0]!.value, 1);
    }
  } finally {
    await store.close();
  }
});
