# ADR-0004: Evidence crosses team boundaries only as published aggregates

**Status:** accepted (2026-07-11) — north-star architecture principle, decided ahead of need
**Tickets:** Baton #86 (hosted multi-team platform)

## Context

The north star is an evidence-backed registry: teams demonstrate "here's our workflow, and here's how it's working for us" to other teams. That requires some cross-team data flow, and the shape of that flow was an open seam in the design. Two models exist:

- **Pull (federated):** the registry gets read access to each team's metrics store and queries live.
- **Push (published snapshots):** each team's own tooling computes aggregates from its own store and explicitly publishes them.

This is decided now — years before the registry is built — because it shapes two things already in motion: the consent conversation (Phase 1's slowest dependency) and what the dashboard app's join layer must eventually produce.

## Decision

**Raw and per-person telemetry never leave the team's own metrics store. The only data that crosses a team boundary is a team-level aggregate, published by explicit action.**

The team's app deployment computes evidence summaries from the same query-time join it already performs for the team's own dashboard, and *publishing* pushes a snapshot of selected summaries to the registry. Nothing is ever fetched out of a team's infrastructure from outside.

A published skill snapshot has a uniform shape (a future contract document, sibling of [CONTRACT.md](../CONTRACT.md)):

- **identity** — skill name, description, owning team, pointer to where the source lives (repo / plugin marketplace). The registry links to skills; it does not host them.
- **dimensions** — the team's own key→value metadata. The skeleton is uniform; the taxonomy inside is the team's vocabulary.
- **evidence** — team-level aggregates over a stated window: breadth ("6 of 8 members, last 30d"), frequency (invocations/week), retention/trend. Never per-person figures; cost only by opt-in.
- **narrative** — optional team blurb ("we run this before every PR").

## Why pull dies

- No team grants an external platform credentials into its observability stack.
- A metrics-store API key cannot express "aggregates only, nothing per-person" — access at that layer is all-or-nothing, so selective sharing cannot be enforced by credentials.
- The registry would have to speak every backend's dialect and inherit every team's uptime.

Any "selective pull" design ends up requiring a team-side component that computes safe views — at which point push is the same thing with fewer moving parts (no inbound access, works behind firewalls, publishing is a visible deliberate act).

## Consequences

- The consent position strengthens: per-person data is for the team's own learning, stays in the team's own store, and structurally *cannot* be published — not merely "won't be".
- The app's join layer should keep its aggregate outputs well-shaped, since "publish" is later just serialization of what the dashboard already computes. No extra Phase 1/2 work.
- The registry (Baton #86) stores published snapshots and metadata — it is a deposit box for claims with receipts, not a place telemetry migrates to. Cross-team vocabulary mapping (one team's `category: implement` vs another's `stage: build`) becomes a registry-side concern when the time comes.
