# skill-tracking

*(working name — final name TBD)*

Track which Claude Code skills your team actually uses, and where in your development lifecycle — so "you should try X when planning" is backed by evidence, not anecdotes.

Skills are authored and invoked exactly as normal. This project adds:

- **[`meta.yaml`](docs/FORMAT.md)** — an optional sidecar file in a skill folder that opts the skill into enriched tracking with team-defined dimensions (e.g. category, author). See [`examples/ticket-planner`](examples/ticket-planner).
- **Telemetry** — Claude Code's native OTEL events (`claude_code.skill_activated`) capture per-skill, per-person usage for *all* skills, sidecar or not.
- **Dashboard** *(planned)* — joins usage with the scanned metadata map: most-used skills, usage per category, per person.

Status: format spec drafted; scanner, telemetry rollout, and dashboard in progress. The Phase 1 plan lives in [docs/PRD.md](docs/PRD.md); domain language in [CONTEXT.md](CONTEXT.md).
