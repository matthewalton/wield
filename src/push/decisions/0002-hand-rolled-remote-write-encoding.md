# 0002 — The remote-write encoding is hand-rolled, not a dependency

**Status:** Accepted (2026-07-12)

## Context

A remote-write 1.0 request body is a snappy-compressed protobuf
`WriteRequest`. The obvious implementations are a protobuf library plus a
snappy binding (native module or pure-JS port), or writing the encoding by
hand. The repo has a single runtime dependency (`yaml`), no build step, and
pushes payloads of a few kilobytes.

## Decision

Hand-roll both encodings in the slice:

- The protobuf schema is four small messages (`WriteRequest`, `TimeSeries`,
  `Label`, `Sample`) using only varint, length-delimited, and fixed64 wire
  types — a page of code, fixed forever by the protocol.
- Snappy's block format accepts a literal-only stream: a varint preamble plus
  one literal element is a valid compression of any payload. At our sizes the
  lost compression is irrelevant; the metrics store's decoder cannot tell the
  difference.

Tests verify the wire bytes with an independent decoder written from the two
format specs (the snappy decoder handles copy elements too, so it checks
conformance rather than mirroring the encoder's assumptions).

## Consequences

- No native modules, no build step, no new dependency; `npm install` stays
  trivial for teammates.
- The encoder cannot compress; if payloads ever grow to megabytes this
  decision should be revisited.
- Remote-write 2.0 (different message, zstd) would be new code, not a
  library version bump — acceptable, since 1.0 remains the universally
  accepted baseline.
