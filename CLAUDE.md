# CLAUDE.md

Wield tracks which Claude Code skills a team actually uses and where in their
development lifecycle. TypeScript run directly by Node (no build step), npm, Node ≥ 22.18.

## Where the truth lives

- **Vocabulary**: [CONTEXT.md](CONTEXT.md) — the canonical glossary; its terms are
  mandatory and each entry lists the synonyms to avoid.
- **Formats and contracts**: [docs/FORMAT.md](docs/FORMAT.md),
  [docs/CONTRACT.md](docs/CONTRACT.md).
- **Decisions**: [docs/adr/](docs/adr/) — read the relevant ADR before re-litigating a
  design choice.
- **Commits**: [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).

## Speccle

Wield is developed under the Speccle convention. Each feature is a named folder
(`src/<feature>/`) holding its code, its tests, a `SPEC.md` of ratified acceptance
criteria, and a `CONTEXT.md` of feature-local terms and decisions. A test claims a
criterion by carrying its `[KEY-n]` token in the full test name. New behaviour goes
through the Speccle skills — `implement-feature` for greenfield, `carve-feature` to
govern existing code, `strengthen` to measure how well tests defend a slice — and
`speccle-oracle lint <feature-folder>` must stay clean.

## Commands

```sh
npm install
npm test              # node --test, no framework
npm run typecheck
npm run lint          # eslint, repo-wide
npm run format:check  # prettier, repo-wide
npm run scan          # run the scanner CLI from source
```

## Style

- Sparse comments: self-describing names; comment only non-obvious constraints.
- eslint + prettier run on staged files via husky — don't hand-format, don't bypass
  hooks.
