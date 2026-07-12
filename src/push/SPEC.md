---
key: PUSH
---

# Push

The local delivery leg: one command that scans roots for skill metadata (via
the scanner slice) and delivers the rendered `skill_meta`/`skill_tag` info
metrics to a Prometheus remote-write endpoint from the user's own machine — no
skills repo, no CI (Baton #117). Wire-compatible with the CI leg
(`promtool push metrics`, docs/delivery.md), so the dashboard join never knows
which leg pushed. Vocabulary is the repo glossary
([CONTEXT.md](../../CONTEXT.md)); feature-local terms are in
[CONTEXT.md](CONTEXT.md) beside this spec, and the slice's decisions in
[decisions/](decisions/).

### The command

## [PUSH-1] A push sends every series the info-metric rendering emits for the scanned roots

The tracer: scan and deliver in one invocation
([decisions/0001](decisions/0001-one-command-own-slice.md)). The slice imports
the scanner's `scan` and `renderInfoMetrics` — the scanner itself stays a pure
function with no network. `--root` is repeatable; with no `--root` flag the
invocation directory is the only root scanned, matching the scanner CLI
(SCAN-32). Scan diagnostics are reported on stderr in the scanner's
`level: file: message` shape.

## [PUSH-2] An error diagnostic from the scan aborts before any request is sent

Exit 1, diagnostics still reported. This mirrors the CI leg, where a failing
scan step blocks the push step: partial data is never delivered. Warnings never
block (SCAN's stance: errors drop data, warnings never do).

## [PUSH-3] A scan yielding no tracked skills sends no request

A warning says there was nothing to push, and the exit stays 0. Untracked is a
legitimate choice (SCAN-35), but someone running a push expects delivery — the
warning points at the likely misdirected `--root`.

### The wire

## [PUSH-4] The push sends the series as a snappy-compressed protobuf WriteRequest

Remote-write 1.0: `Content-Encoding: snappy`,
`Content-Type: application/x-protobuf`,
`X-Prometheus-Remote-Write-Version: 0.1.0`, labels within each series sorted
lexicographically by name as the protocol requires. Whether the encoding is
hand-rolled or a dependency is an implementation decision recorded in
[decisions/](decisions/) when it lands.

## [PUSH-5] Every pushed series carries a job="wield" label

The same label the CI leg attaches via `promtool push metrics
--label=job=wield` — panels filter on it, so both legs must agree.

## [PUSH-6] All samples in one push carry the same push-time millisecond timestamp

What `promtool push metrics` does; the freshness and hygiene rules in
docs/delivery.md (the `last_over_time` window, the re-push cadence) are built
on push-time stamps.

## [PUSH-7] The remote-write request authenticates with HTTP Basic auth built from the push configuration

`Authorization: Basic base64(username:password)` — username is the stack's
numeric instance ID, password the access-policy token. The token alone,
unpaired with the instance ID, fails auth silently (the gotcha in
docs/delivery.md and ops/otel/README.md).

### Outcome reporting

## [PUSH-8] A missing push-configuration variable exits 2 with a complaint naming it

The complaint names every missing variable of the three
(`PROM_REMOTE_WRITE_URL`, `PROM_REMOTE_WRITE_USERNAME`,
`PROM_REMOTE_WRITE_PASSWORD`), on stderr, in one line. Nothing is scanned and
nothing is sent — misconfiguration is a usage error, the scanner's exit-2
class.

## [PUSH-9] A successful push reports the pushed series count on stderr

The report also names the endpoint. Exit 0; stdout stays empty — reporting is
commentary, not output.

## [PUSH-10] A rejected push exits 1 with the HTTP status and response body on stderr

The response body is the store's own complaint (out-of-order samples, bad
auth) — swallowing it would leave the user diagnosing blind.

## [PUSH-11] A network failure exits 1 with a single-line message on stderr

Connection refused, DNS failure, timeout: the message, not a stack trace —
the same stance as SCAN-36.

### The CLI surface

## [PUSH-12] --dry-run prints the rendered series without sending a request

Printed to stdout in the exposition format, so a teammate can inspect exactly
what would be delivered before acquiring a token: the push configuration is
not required for a dry run. The series-count report still goes to stderr.

## [PUSH-13] --help prints usage and exits 0

## [PUSH-14] An unrecognised flag exits 2 with the complaint on stderr

Covers everything argument parsing rejects, single line, nothing scanned —
the scanner CLI's stance (SCAN-36).
