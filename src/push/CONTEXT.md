# Push — feature context

The project glossary ([../../CONTEXT.md](../../CONTEXT.md)) owns the domain
words — skill, dimension, metadata map, skill name. The scanner's glossary
([../scanner/CONTEXT.md](../scanner/CONTEXT.md)) owns `skill_meta`,
`skill_tag`, and diagnostic. This file adds only what is local to the push
slice.

## Terms

**Push**:
One invocation that scans roots and delivers the rendered info-metric series
to the metrics store. The local counterpart of the CI leg in
docs/delivery.md.
_Avoid_: upload, publish (publishing is the Phase-2 skill-card term), export

**Push configuration**:
The three environment variables a push needs: `PROM_REMOTE_WRITE_URL`,
`PROM_REMOTE_WRITE_USERNAME`, `PROM_REMOTE_WRITE_PASSWORD` — the same names
the CI leg uses as GitHub Actions secrets.
_Avoid_: secrets, credentials, env block

**Remote-write request**:
The HTTP POST carrying the series: a snappy-compressed protobuf
`WriteRequest` per Prometheus remote-write 1.0.
_Avoid_: promtool push, remote write call

**Dry run**:
A push that prints what would be delivered and sends nothing; needs no push
configuration.
_Avoid_: preview, no-op mode
