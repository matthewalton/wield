---
key: SCAN
---

# Scanner

The scanner walks one or more roots for `.claude/skills/*/` skill folders, reads
dimensions from each skill's homes — the `metadata` field in `SKILL.md`
frontmatter (primary) and the `meta.yaml` sidecar (override, for unowned skills)
— validates them, and exports the metadata map as JSON (the durable artifact) or
as Prometheus info metrics (the Phase 1 adapter). Frontmatter-primary is
FORMAT.md v2 (ADR-0003). Vocabulary is the repo glossary
([CONTEXT.md](../../CONTEXT.md)); feature-local terms and decisions are in
[CONTEXT.md](CONTEXT.md) beside this spec.

### The walk and merge

## [SCAN-1] A skill folder with a meta.yaml sidecar enters the metadata map

Presence opts a skill in. The sidecar is the override home — it exists for
skills whose `SKILL.md` cannot be edited without forking (plugin-provided,
vendored) — but nothing checks ownership: a sidecar alone is a valid opt-in.

## [SCAN-2] An empty sidecar makes a skill tracked with no dimensions

An empty file parses to `null`; so does one containing only comments. Both yield
an entry with `{}` dimensions and no diagnostics.

## [SCAN-33] A metadata field in SKILL.md frontmatter opts its skill into the metadata map

The primary home (FORMAT.md v2): tracking a skill you own is three lines in the
file you were already writing, no second file to remember. A `SKILL.md` whose
frontmatter block is missing or fails to parse simply has no readable `metadata`
— the skill is untracked without a diagnostic, matching SCAN-3's stance that
malformed frontmatter is Claude Code's problem.

## [SCAN-34] An empty metadata field makes a skill tracked with no dimensions

`metadata:` with no value parses to `null`, and `metadata: {}` to an empty map.
Presence opts in, exactly as an empty sidecar does (SCAN-2): an entry with `{}`
dimensions and no diagnostics.

## [SCAN-35] A skill folder with neither frontmatter metadata nor a sidecar is skipped without a diagnostic

Untracked is a legitimate choice, not an omission. This includes a folder with
no `SKILL.md` at all, and a `SKILL.md` whose frontmatter has no `metadata` key.

## [SCAN-36] The sidecar's dimensions replace frontmatter metadata wholesale with a warning when both exist

No per-key merging: a frontmatter key absent from the sidecar is gone from the
entry. Two homes half-defining a skill would make "where is this value set?"
unanswerable; the warning names both files so the redundant frontmatter can be
cleaned up or the sidecar deleted.

## [SCAN-3] A skill's map key is the name declared in SKILL.md frontmatter

That is what Claude Code reports as `skill.name` in telemetry; keying by folder
would join against nothing. When the declared name differs from the folder name,
the declared name is used and a warning says so. A SKILL.md without a frontmatter
block — or with one that fails to parse — falls back to the folder name silently
(deliberate: malformed frontmatter is Claude Code's problem, not the scanner's).

## [SCAN-4] A sidecar with no SKILL.md beside it falls back to the folder name and warns

The folder name may not be what telemetry reports, so the warning flags the
fallback.

## [SCAN-5] The first definition wins when one skill name appears twice with different dimensions

Telemetry only carries `skill.name`, so duplicates are indistinguishable
downstream. The first root scanned keeps the name, and a warning says usage
cannot be attributed between the definitions.

## [SCAN-6] A duplicate definition with identical dimensions produces no diagnostic

The same skill vendored into two roots is normal, not a conflict.

## [SCAN-7] A root with no skills directory warns and contributes nothing

Scanning continues with the remaining roots.

## [SCAN-8] A sidecar that fails to parse drops its skill with an error, leaving other skills in the map

One broken file must not cost the rest of the repo its map.

### Dimension validation

One set of value rules, applied to whichever home the dimensions came from —
frontmatter `metadata` and sidecar validate identically.

## [SCAN-9] String and list-of-string dimension values are kept verbatim

A string is a grouping dimension, a list of strings a set dimension
(docs/FORMAT.md). Same rule in both homes.

## [SCAN-10] A dimension value that is neither a string nor a list of strings is dropped with an error naming the key

Numbers, booleans, null, and nested maps are invalid. Only the offending key is
dropped — the home's valid keys survive.

## [SCAN-11] A list containing a non-string member drops the entire key

The error names the first bad member's type; there is no partial keep of the
good members.

## [SCAN-12] A dimensions home that is not a map yields one error and no dimensions

A sidecar containing a bare list or string, or a frontmatter `metadata` value
that is one. The error describes what was found instead (`a list`, `a string`,
…). The skill still enters the map, tracked with no dimensions.

## [SCAN-13] Unknown dimension keys are kept without diagnostics

The format reserves no keys; consumers ignore what they don't understand
(docs/FORMAT.md rule 5).

### The info-metric rendering

## [SCAN-14] Every skill in the map emits exactly one skill_meta series

Even a skill with no grouping dimensions gets a bare
`skill_meta{skill_name="…"} 1`. This is the invariant that keeps `group_left`
joins safe — the join errors out entirely if the right-hand side has two rows
for one `skill_name` — and makes tracked skills discoverable.

## [SCAN-15] Grouping dimensions become labels on their skill's skill_meta series

## [SCAN-16] Each member of a set dimension emits one skill_tag series keyed by its dimension

The series carries `skill_name`, `key` (the dimension), and `value` (the
member), so `tags` and `invokes` stay distinguishable on one metric.

## [SCAN-17] Set dimensions never appear as skill_meta labels

A list flattened into a label would either double-count under grouping or
collapse the set; it fans out to skill_tag instead (ADR-0002).

## [SCAN-18] The skill_tag metric is omitted when nothing is set-valued

No members, no metric — including its HELP/TYPE header lines.

## [SCAN-19] A dimension key that is not a valid Prometheus label name is exported under a sanitized label with a warning

Invalid characters become `_`; a result that still fails the label grammar is
prefixed with `_`.

## [SCAN-20] Only the first of two keys that sanitize to the same label is emitted

The later key is omitted from skill_meta with a warning naming the collision.
Duplicate labels on one series are invalid exposition format — Prometheus would
reject the whole scrape.

## [SCAN-21] A dimension colliding with a reserved label is omitted from skill_meta with a warning

Reserved: `skill_name`, `key`, `value`.

## [SCAN-22] Backslashes and quotes in label values are escaped

Newlines are escaped to `\n` as well.

## [SCAN-23] Rendering is byte-identical for maps that differ only in key order

Skills are sorted by name, labels by key; series order within skill_tag is
deterministic.

### The CLI surface

## [SCAN-24] The CLI prints the metadata map as JSON on stdout by default

Pretty-printed with a trailing newline — the durable artifact form
(docs/CONTRACT.md).

## [SCAN-25] --format prom prints the Prometheus info-metric rendering

Rendering diagnostics join the scan diagnostics for reporting and exit-code
purposes.

## [SCAN-26] An unrecognised --format exits 2 with the complaint on stderr

Exit 2 is the usage-error code; nothing is scanned.

## [SCAN-27] Diagnostics are written to stderr as level: file: message lines

Stdout stays clean for the map, so piping the output is safe.

## [SCAN-28] Any error diagnostic makes the exit code 1

The output is still written first — a partial map plus a failing exit, not
silence.

## [SCAN-29] With --strict, warnings alone make the exit code 1

Without it, warnings are informational and the exit stays 0.

## [SCAN-30] --out writes the output to a file instead of stdout

Diagnostics still go to stderr.

## [SCAN-31] --help prints usage and exits 0

## [SCAN-32] With no --root flag, the invocation directory is the only root scanned

`--root` is repeatable; passing any root replaces the default rather than
adding to it.
