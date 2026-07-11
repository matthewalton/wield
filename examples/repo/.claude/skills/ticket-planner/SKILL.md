---
name: ticket-planner
description: Plan a ticket into an ordered implementation checklist before any code is written. Use when picking up a new ticket or when the user asks to plan a piece of work.
---

# Ticket Planner

Given a ticket, produce an ordered implementation checklist:

1. Restate the ticket's goal in one sentence and confirm it with the user.
2. List the code areas the change touches.
3. Break the work into steps small enough to verify independently.
4. Call out risks and open questions at the end.

(This is an example skill demonstrating the sidecar override — see `meta.yaml`
alongside this file, the home for skills whose frontmatter you can't edit.
Compare `pr-describer`, which carries its dimensions in frontmatter `metadata`,
the primary home.)
