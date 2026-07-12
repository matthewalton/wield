---
description: Scaffold tracking metadata into this project's skills, interactively
---

Onboard this project's skills into skill tracking. Tracking metadata lives in
one place: the `metadata` field of each skill's `SKILL.md` frontmatter — never
a second file. Untracked is a legitimate choice, not an omission: offer, don't
insist.

1. List the project's skills: every folder under `.claude/skills/` holding a
   `SKILL.md`. If there are none, say so and stop.
2. Read `${CLAUDE_PLUGIN_ROOT}/docs/FORMAT.md` for the format and its rules.
   The short version: a scalar value like `category: plan` is a grouping
   dimension (one bucket per skill, buckets sum to the total); a list like
   `tags: [experimental, slow]` is a set dimension (filter, never group). The
   format reserves no keys; the team picks its own vocabulary.
3. For each skill, show its `name` and `description` from the frontmatter and
   ask whether to track it, and under which dimensions. Suggest a `category`
   consistent with what other skills in the project already use; put
   multi-valued ideas in a set dimension like `tags`, never in `category`.
4. For each skill the user opts in, edit its `SKILL.md` frontmatter in place:
   add a `metadata:` field carrying the chosen dimensions. Touch nothing else
   in the file. A skill the user skips is left exactly as it was.
5. Finish by running the scanner so the user sees the resulting metadata map:

   ```sh
   node "${CLAUDE_PLUGIN_ROOT}/src/scanner/src/cli.ts"
   ```

   (If `${CLAUDE_PLUGIN_ROOT}/node_modules` is missing, run
   `npm install --prefix "${CLAUDE_PLUGIN_ROOT}" --omit=dev` first.)
