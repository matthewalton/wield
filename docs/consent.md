# Telemetry consent — per-person skill usage tracking

**Status:** draft (2026-07-10) — to be sent to the team/org before telemetry is enabled. Consent is a Phase 1 prerequisite (see [PRD](PRD.md)); nothing ships until this is agreed.

## The ask

We want to enable Claude Code's built-in OpenTelemetry monitoring for the team, so we can see which skills people actually use and where in the lifecycle they use them. That data is attributed **per person** (user id/email) and includes **cost and token usage**. We're asking for explicit agreement to that before turning anything on.

## Draft message to the team

> **Subject: Proposal — turn on Claude Code usage telemetry (skill usage, per person)**
>
> We're building skill-usage tracking so recommendations for "what skill should I use here" come from evidence instead of anecdotes (see the Phase 1 PRD in the Wield repo).
>
> To do that we'd enable Claude Code's native OTEL telemetry via managed settings for everyone on the team. Concretely, that means the following would be collected into a backend the team controls:
>
> - **Skill invocations** — which skill, how it was invoked, per user, per session.
> - **Cost and token usage** — per user, attributed to skills/agents where Claude Code provides it.
> - **Standard attribution** — user id, email, organization id, session id.
>
> What is **not** collected (default privacy posture, we will not opt in to more):
>
> - No prompt content, no code, no tool inputs/outputs. Telemetry is counts and metadata only.
>
> Ground rules we're committing to in writing:
>
> 1. **Numbers are for learning, never for performance review.** This data will not be used to evaluate individuals, and dashboards exist to surface useful workflows, not to rank people.
> 2. The backend is team-owned; access is limited to the team.
> 3. Anyone can raise concerns and we'll revisit — including switching per-person views off in the dashboard while keeping aggregate views.
>
> Please reply with concerns or a 👍 by **[date]**. We won't enable anything until we have agreement.

## Open points to resolve during the conversation

- Whether email (vs opaque user id) is needed on metrics, or whether the dashboard can map ids → names locally. Less PII in the backend is an easy win if the join still works.
- Data retention: propose a default (e.g. 90 days) and confirm nobody needs longer.
- Who signs off — is team-level agreement enough, or does org/IT need to approve managed settings deployment?
- **Long-term direction, be upfront now:** the project's north star is cross-team skill sharing (Baton #86). Per-person telemetry — cost, usage, attribution — would **never** leave the team under any version of that; the only thing that could ever be shared outward is skill metadata plus aggregated/anonymized adoption signals, and that would be a separate opt-in conversation. Saying this now avoids the consent feeling like a bait-and-switch later.
- **Possible future ask, be upfront now:** Claude Code masks custom skill names on invocation events unless `OTEL_LOG_TOOL_DETAILS=1` is set — a switch that also exports tool parameters (commands, file paths). If per-skill invocation events turn out to be needed, the team would have to consent to that separately, ideally with a filtering collector stripping tool parameters before storage. Metrics-based tracking (the current plan) does not need it.

## Decision log

- _(record the outcome, date, and any conditions here once the conversation lands)_
