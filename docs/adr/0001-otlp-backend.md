# ADR-0001: OTLP backend — Grafana Cloud free tier, direct export

**Status:** proposed (2026-07-10) — needs team sign-off alongside the [consent agreement](../consent.md)
**Ticket:** Baton #80

## Context

Claude Code emits usage telemetry over OTLP: metrics (cost, tokens, sessions) **and** log events — `claude_code.skill_activated`, the signal the whole Phase 1 dashboard joins on. The backend therefore must ingest both OTLP metrics and OTLP logs, be queryable by the dashboard (#79), and be owned by someone on the team. Candidates from the ticket: Grafana Cloud free tier, Honeycomb, self-hosted collector + stack.

Volume is small — one team's CLI usage; tens of sessions/day, far below any free-tier ceiling.

## Decision

**Grafana Cloud free tier, with Claude Code exporting directly to its OTLP gateway** (`http/protobuf` + basic-auth write token in managed settings). No intermediary collector for Phase 1.

## Why

- **Handles both signals natively.** The free tier ingests OTLP metrics (→ Mimir) and logs (→ Loki) through one gateway endpoint — one endpoint, one credential in managed settings. Honeycomb is event/trace-first; OTLP metrics support is plan-gated, and our core join needs metrics _and_ events.
- **Nobody has to run anything.** A self-hosted collector + Prometheus/Loki gives full control but makes "who owns it" a real ops job — unjustified before the tracking proves demand (same logic as the distribution descope).
- **Free tier fits.** ~10k active metric series / 50 GB logs per month, 14-day log retention; our volume is a rounding error. Metric retention (13 months) covers trend views.
- **Dashboard story is flexible.** #79 can start as Grafana dashboards (zero extra infra) and graduate to a custom app querying the Prometheus/Loki HTTP APIs when the metadata-map join needs real code.

## Trade-offs accepted

- **Write token on every laptop.** The OTLP header in managed settings is a shared write-only credential. Blast radius: someone could send junk data. Acceptable for Phase 1; rotate if it leaks. A team collector (which would keep vendor creds off laptops) is the known fix if this ever bites.
- **14-day log retention on free tier** — raw `skill_activated` events age out. Mitigation if it matters: a Loki recording rule or scheduled export to roll events up into a metric before expiry; decide when building #79.
- **PII (user.email) in a SaaS backend** — surfaced in the consent conversation as an open point; if the team prefers, the dashboard can map opaque `user.id`s to names locally instead.
- Vendor lock-in is shallow: everything speaks OTLP, so switching backends is a two-line managed-settings change.

## Open challenges to this decision (added 2026-07-10)

- **Team already runs Grafana at work.** If it ingests OTLP, targeting it instead of a new free-tier org may be strictly better. Check with its owner.
- **skill.name masking may force a collector after all.** Live testing showed `skill_activated` events mask user-defined skill names to `"custom_skill"`; the only unmask switch (`OTEL_LOG_TOOL_DETAILS=1`) also exports tool parameters. Direct export cannot strip those before storage — a small filtering collector could. Decision holds only if the metrics-side join (names verbatim on cost/token metrics per docs) proves sufficient; verify empirically. See `otel/README.md` masking table.

## Ownership

The Grafana Cloud org is created under a team-owned account (not a personal one); admin access for at least two people. **Owner: TBD in the consent/sign-off conversation.**
