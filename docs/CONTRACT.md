# Ingest contract — the agent-agnostic boundary

**Status:** v1 draft (2026-07-10)

The north star (Baton #86) spans agents, not just Claude Code. To keep that door open without building anything now, everything downstream of ingest — backend, join, dashboard — depends only on the two shapes below, never on who produced them.

**Claude Code is the first adapter, not the platform.** Every design decision gets tested against: *does this leak Claude-isms past the adapter boundary?*

## Usage event

One observation of a skill being used:

| Field | Required | Notes |
|---|---|---|
| `skill_name` | yes | Join key against the metadata map. |
| `user` | yes | Per-person attribution (id or email — see the [consent draft](consent.md)). |
| `timestamp` | yes | |
| `cost`, `tokens` | no | Enrichment; only some sources have it. Absence is not an error. |
| `source` | no | Which agent/adapter emitted the event (e.g. `claude-code-otel`). |

## Metadata map

Skill name → dimensions (string or list-of-string values per [FORMAT.md](FORMAT.md)). Like the usage event, this shape is a **source-agnostic boundary** ([ADR-0003](adr/0003-frontmatter-metadata.md)): consumers depend on the map, never on who produced it.

- **Repo scanner** (source #1, the only one built): walks **one or more roots** of `.claude/skills/*/`, reading frontmatter `metadata` fields and `meta.yaml` sidecar overrides, and merges the results — the tracker has no opinion on repo layout (monorepo, dedicated skills repo, plugin repo).
- **Future sources** (none built): a CMS adapter for teams that manage skill metadata elsewhere (Baton #98), or app-side tagging as an addition. Any source must key entries by the exact `skill.name` telemetry reports (the `SKILL.md` frontmatter name), or the join finds nothing.

## Evidence snapshot (future)

When the registry (Baton #86) is built, a third shape joins this contract: the **published snapshot** — a skill's identity, dimensions, and team-level evidence aggregates. Its principles are already fixed in [ADR-0004](adr/0004-published-aggregates.md): push not pull, team-level aggregates only, never per-person data. The shape itself is specified when the registry is.

## Adapters

- **Claude Code OTEL** (adapter #1, the only one built): cost/token metrics carry `skill.name` verbatim, per-user attribution comes from standard OTEL resource attributes. Mapping details in [`otel/README.md`](../otel/README.md); backend choice in [ADR-0001](adr/0001-otlp-backend.md).
- **PostToolUse hook** — the documented fallback if metrics-side `skill.name` behavior breaks (see [ADR-0002](adr/0002-query-time-join.md)). Same event shape, minus cost/tokens.
- **Future agents** — no adapters are built until demand exists. The natural moment is the self-contained app with its own ingest (deferred in ADR-0002): anything that can speak HTTP can then report usage events.
