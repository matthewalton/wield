/**
 * Encode series as a Prometheus remote-write 1.0 request body: a
 * snappy-compressed protobuf WriteRequest. Both encodings are hand-rolled
 * (decisions/0002): the protobuf schema is four tiny messages, and snappy's
 * block format accepts a literal-only stream, which a decoder cannot tell
 * from the compressed kind.
 */

export interface WireSeries {
  labels: [string, string][];
  value: number;
}

const varint = (n: number): Buffer => {
  const bytes: number[] = [];
  let v = BigInt(n);
  while (v > 0x7fn) {
    bytes.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  bytes.push(Number(v));
  return Buffer.from(bytes);
};

/** A length-delimited field: tag byte, varint length, payload. */
const lengthDelimited = (tag: number, payload: Buffer): Buffer =>
  Buffer.concat([Buffer.from([tag]), varint(payload.length), payload]);

// Label { string name = 1; string value = 2; }
// Stryker disable StringLiteral: Buffer.from treats a falsy encoding as utf8, the same encoder
const encodeLabel = ([name, value]: [string, string]): Buffer =>
  Buffer.concat([
    lengthDelimited(0x0a, Buffer.from(name, "utf8")),
    lengthDelimited(0x12, Buffer.from(value, "utf8")),
  ]);
// Stryker restore StringLiteral

// Sample { double value = 1; int64 timestamp = 2; }
function encodeSample(value: number, timestampMs: number): Buffer {
  const double = Buffer.alloc(9);
  double[0] = 0x09;
  double.writeDoubleLE(value, 1);
  return Buffer.concat([double, Buffer.from([0x10]), varint(timestampMs)]);
}

// TimeSeries { repeated Label labels = 1; repeated Sample samples = 2; }
function encodeTimeSeries(series: WireSeries, timestampMs: number): Buffer {
  // Remote-write requires each series' labels sorted by name. Names within a
  // series are distinct (the renderer dedupes; duplicates are protocol-invalid),
  // so "not less" always means greater.
  // Stryker disable next-line EqualityOperator: with distinct names, a < b and a <= b agree
  const sorted = [...series.labels].sort(([a], [b]) => (a < b ? -1 : 1));
  return Buffer.concat([
    ...sorted.map((label) => lengthDelimited(0x0a, encodeLabel(label))),
    lengthDelimited(0x12, encodeSample(series.value, timestampMs)),
  ]);
}

// WriteRequest { repeated TimeSeries timeseries = 1; }
export function encodeWriteRequest(series: WireSeries[], timestampMs: number): Buffer {
  return snappyCompress(
    Buffer.concat(series.map((s) => lengthDelimited(0x0a, encodeTimeSeries(s, timestampMs)))),
  );
}

/** Literal-only snappy block format: varint preamble, one literal element. */
export function snappyCompress(data: Buffer): Buffer {
  const len = data.length - 1;
  let literalTag: Buffer;
  if (data.length <= 60) literalTag = Buffer.from([len << 2]);
  else if (len < 0x100) literalTag = Buffer.from([60 << 2, len]);
  else if (len < 0x10000) literalTag = Buffer.from([61 << 2, len & 0xff, len >>> 8]);
  else {
    literalTag = Buffer.alloc(4);
    literalTag[0] = 62 << 2;
    literalTag.writeUIntLE(len, 1, 3);
  }
  return Buffer.concat([varint(data.length), literalTag, data]);
}
