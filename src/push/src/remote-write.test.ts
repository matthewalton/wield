import assert from "node:assert/strict";
import { test } from "vitest";
import { type WireSeries, encodeWriteRequest, snappyCompress } from "./remote-write.ts";

// In-process tests for the remote-write request body. Expected buffers are
// hand-derived from the two format specs (prompb; snappy block format), byte
// by byte — conformance against the spec, not a mirror of the encoder
// (decisions/0002). cli.test.ts keeps the end-to-end decode; mutants are only
// observable here (ADR-0006).

const DOUBLE_ONE = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x3f]; // 1 as little-endian float64

test("[PUSH-4] one series encodes to the exact spec bytes, labels sorted by name", () => {
  // Labels arrive unsorted; the protocol requires them sorted by name. Three
  // names in this order distinguish a real sort from keep-order and reverse.
  const series: WireSeries[] = [
    {
      labels: [
        ["b", "y"],
        ["c", "z"],
        ["a", "x"],
      ],
      value: 1,
    },
  ];
  // prettier-ignore
  const expected = Buffer.from([
    0x28,                                       // snappy: uncompressed length 40
    0x9c,                                       // snappy: literal tag, (40-1)<<2
    0x0a, 38,                                   // WriteRequest.timeseries, 38 bytes
    0x0a, 6, 0x0a, 1, 0x61, 0x12, 1, 0x78,      //   Label a="x" — sorted first
    0x0a, 6, 0x0a, 1, 0x62, 0x12, 1, 0x79,      //   Label b="y"
    0x0a, 6, 0x0a, 1, 0x63, 0x12, 1, 0x7a,      //   Label c="z"
    0x12, 12,                                   //   Sample, 12 bytes
    0x09, ...DOUBLE_ONE,                        //     value 1 as fixed64 double
    0x10, 0xe8, 0x07,                           //     timestamp varint 1000
  ]);
  assert.deepEqual(encodeWriteRequest(series, 1000), expected);
});

test("[PUSH-6] every series in one request carries the given push-time millisecond timestamp", () => {
  const series: WireSeries[] = [
    { labels: [["n", "p"]], value: 1 },
    { labels: [["n", "q"]], value: 1 },
  ];
  // varint(1752489000000) — a realistic Date.now(), six varint bytes.
  const ts = [0xc0, 0xf8, 0xef, 0xc3, 0x80, 0x33];
  // prettier-ignore
  const timeSeries = (labelValue: number) => [
    0x0a, 26,                                    // WriteRequest.timeseries, 26 bytes
    0x0a, 6, 0x0a, 1, 0x6e, 0x12, 1, labelValue, //   Label n="p" / n="q"
    0x12, 16,                                    //   Sample, 16 bytes
    0x09, ...DOUBLE_ONE,                         //     value 1
    0x10, ...ts,                                 //     the one shared timestamp
  ];
  // prettier-ignore
  const expected = Buffer.from([
    0x38,                                       // snappy: uncompressed length 56
    0xdc,                                       // snappy: literal tag, (56-1)<<2
    ...timeSeries(0x70),                        // "p"
    ...timeSeries(0x71),                        // "q"
  ]);
  assert.deepEqual(encodeWriteRequest(series, 1752489000000), expected);
});

test("[PUSH-4] snappy literal framing holds across every length tier", () => {
  // tag byte encodes length-1: one byte up to 60 bytes of data, then 1-, 2-
  // and 3-byte little-endian length forms. Sizes bracket each boundary.
  const cases: { size: number; prefix: number[] }[] = [
    { size: 1, prefix: [0x01, 0x00] },
    { size: 60, prefix: [0x3c, 0xec] },
    { size: 61, prefix: [0x3d, 0xf0, 0x3c] },
    { size: 127, prefix: [0x7f, 0xf0, 0x7e] },
    { size: 128, prefix: [0x80, 0x01, 0xf0, 0x7f] },
    { size: 256, prefix: [0x80, 0x02, 0xf0, 0xff] },
    { size: 257, prefix: [0x81, 0x02, 0xf4, 0x00, 0x01] },
    { size: 65536, prefix: [0x80, 0x80, 0x04, 0xf4, 0xff, 0xff] },
    { size: 65537, prefix: [0x81, 0x80, 0x04, 0xf8, 0x00, 0x00, 0x01] },
  ];
  for (const { size, prefix } of cases) {
    const data = Buffer.alloc(size, 0xab);
    assert.deepEqual(
      snappyCompress(data),
      Buffer.concat([Buffer.from(prefix), data]),
      `framing for ${size} bytes`,
    );
  }
});
