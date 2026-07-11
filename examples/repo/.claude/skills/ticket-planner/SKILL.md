---
name: ticket-planner
description: Plan a ticket into an ordered implementation checklist before any code is written. Use when picking up a new ticket or when the user asks to plan a piece of work.
metadata:
  # Scalar values partition the skills — group the dashboard by them.
  category: plan
  author: sarah
  # List values are sets — filter by them, never group by them.
  tags: [experimental]
  invokes: [grill-me]
---

# Ticket Planner

Given a ticket, produce an ordered implementation checklist:

1. Restate the ticket's goal in one sentence and confirm it with the user.
2. List the code areas the change touches.
3. Break the work into steps small enough to verify independently.
4. Call out risks and open questions at the end.

(This is an example skill demonstrating tracked dimensions — the `metadata`
field above, per docs/FORMAT.md. Note `invokes`, a set dimension reserved for
future tooling.)
