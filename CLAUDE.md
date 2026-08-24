# Research & Knowledge Base: LLM Wiki

Mode: Mode E (Research & Knowledge Base)
Purpose: Persistent research repository, literature synthesis, and conceptual knowledge base.
Owner: Shiroe
Created: 2026-08-25

## Structure

```
vault/
├── .raw/              # Layer 1: Immutable source documents
│   ├── papers/        # Downloaded academic papers & preprints
│   ├── articles/      # Web articles, blog posts, essays
│   ├── data/          # Raw datasets, statistics, metrics
│   └── notes/         # Unstructured raw notes & meeting dumps
├── wiki/              # Layer 2: Synthesized knowledge base
│   ├── index.md       # Master catalog of all pages
│   ├── log.md         # Chronological audit log of operations
│   ├── hot.md         # Hot cache: ~500-word recent context summary
│   ├── overview.md    # Executive summary of the whole wiki
│   ├── sources/       # Summaries of raw sources with claims
│   ├── papers/        # Academic paper extractions & methodology
│   ├── concepts/      # Theories, frameworks, algorithms, models
│   ├── entities/      # Organizations, protocols, tools, systems
│   ├── thesis/        # Evolving synthesis: state of the field
│   ├── gaps/          # Open questions, contradictions, missing data
│   ├── comparisons/   # Side-by-side analysis & benchmarks
│   ├── questions/     # Synthesized answers to research queries
│   ├── domains/       # Top-level topic taxonomy
│   └── meta/          # Conventions, dashboards, health checks
├── _templates/        # Note templates by type
│   ├── paper.md
│   ├── concept.md
│   ├── entity.md
│   ├── source.md
│   ├── thesis.md
│   ├── gap.md
│   ├── question.md
│   └── domain.md
└── CLAUDE.md          # Schema, routing rules, and conventions
```

## Conventions

- All notes use flat YAML frontmatter: `type`, `title`, `created`, `updated`, `tags`, `status` (minimum).
- Wikilinks use `[[Note Name]]` format: filenames are unique.
- `.raw/` contains source documents: never modify them.
- `wiki/index.md` is the master catalog: update on every ingest.
- `wiki/log.md` is append-only.
- Maintain `wiki/hot.md` at < 500 words for low-token context recovery.

## Operations

- **Ingest**: Drop source in `.raw/`, say "ingest [filename]" (handled via `wiki-ingest`).
- **Query**: Ask research questions (handled via `wiki-query`).
- **Autoresearch**: Run iterative research deep dives via `/autoresearch [topic]`.
- **Lint**: Run health check and link validation via `wiki-lint`.
