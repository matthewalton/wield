# Scanner — feature context

The project glossary ([../../CONTEXT.md](../../CONTEXT.md)) owns the domain words —
skill, dimension, grouping/set dimension, metadata map, skill name.
This file adds only what is local to the scanner slice.

## Terms

**Diagnostic**:
A `{level, file, message}` record the scanner accumulates instead of throwing.
`error` means data was dropped (a key, a skill); `warn` means the output is
complete but something deserves attention. The CLI prints them to stderr as
`level: file: message`.
_Avoid_: log, issue, violation

**skill_meta**:
The info metric with exactly one series per skill, carrying grouping dimensions
as labels. The safe side of a `group_left` join — group by it.
_Avoid_: meta metric

**skill_tag**:
The info metric with one series per (skill, dimension, member) for set
dimensions. Filter with `and on(skill_name)`; never group by it — overlapping
buckets double-count.
_Avoid_: tag metric

**Sanitized label**:
A dimension key rewritten to satisfy Prometheus's label grammar (invalid
characters to `_`, leading `_` when the result still fails). Always announced
with a warning.

**Source (of an entry)**:
The `SKILL.md` path a map entry's dimensions came from, relative to the
invocation's working directory. Used in diagnostics to say where a duplicate
was first defined.
