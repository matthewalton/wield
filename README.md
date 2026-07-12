# Wield

Track which Claude Code skills your team actually uses, and where in your development lifecycle — so "you should try X when planning" is backed by evidence, not anecdotes.

Skills are authored and invoked exactly as normal. This project adds:

- **[Dimensions](docs/FORMAT.md)** — optional team-defined metadata (e.g. category, author, tags) in a skill's `SKILL.md` frontmatter (the spec's `metadata` field), opting it into enriched tracking. See [`examples/repo`](examples/repo).
- **Telemetry** — Claude Code's native OTEL cost/token metrics carry `skill.name`, capturing per-skill, per-person usage for _all_ skills, dimensions or not.
- **Scanner** — a stateless CLI that walks one or more roots and exports the metadata map the dashboard joins against; [CI runs it on merge](docs/delivery.md) and delivers the result to the metrics store.
- **[Dashboard](grafana/README.md)** — Grafana panels joining usage with the metadata map at query time: most-used skills, usage per category, per person, trend and cost.

```console
$ npm run scan -- --root examples/repo               # the metadata map, as JSON
$ npm run scan -- --root examples/repo --format prom # Prometheus info metrics for Grafana
```

Status: format spec, scanner, and dashboard shipped; telemetry rollout in progress. The Phase 1 plan lives in [docs/PRD.md](docs/PRD.md); domain language in [CONTEXT.md](CONTEXT.md).
