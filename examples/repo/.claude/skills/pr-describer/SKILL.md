---
name: pr-describer
description: Write a pull request description from the branch's diff and commit history. Use when opening a PR or when the user asks to describe pending changes.
metadata:
  category: review
  author: sarah
  tags: [experimental]
---

# PR Describer

Given the current branch, produce a pull request description:

1. Summarise the change's intent in one paragraph, from the commit messages.
2. List user-visible behaviour changes separately from refactors.
3. Note anything the diff touches that reviewers historically comment on.
4. End with a test plan derived from what the change actually exercises.

(This is an example skill demonstrating frontmatter-tracked dimensions — the
`metadata` field above is the primary home; no sidecar needed. Compare
`ticket-planner`, which shows the sidecar override for unowned skills.)
