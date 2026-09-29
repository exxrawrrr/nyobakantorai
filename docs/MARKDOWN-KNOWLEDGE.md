# Markdown knowledge workflow

Fikri is the default **Knowledge / Markdown / Policy Steward**.

The goal is not “convert everything to Markdown.” The goal is a **smaller, source-preserving representation** that workers can load progressively without losing decision-changing structure.

## Tool order

1. Existing trusted Markdown/text → normalize directly.
2. **Microsoft MarkItDown / MarkItDown MCP** for common office files and URLs when explicitly installed/connected.
3. **Docling** when complex PDF/layout/table structure matters.
4. **Jina Reader / ReaderLM-style conversion** for web-to-readable-Markdown workflows.
5. Manual extraction when no converter is connected.

All integrations are optional. `documents.markdown.convert` defaults to `NOT_CONNECTED`.

## MarkItDown MCP

Upstream: https://github.com/microsoft/markitdown

Install separately:

```bash
pip install markitdown-mcp
```

The upstream MCP exposes `convert_to_markdown(uri)`. Prefer STDIO or localhost. MarkItDown MCP has no authentication and inherits the permissions of its process, so do **not** bind it publicly and do not point it at secrets.

Hermes can consume MCP servers, but MCP config/auth belongs to the user's Hermes runtime—not this repository.

## Three-layer Markdown

- **L0 Executive** — roughly 100–200 words: decisions, alerts, next actions.
- **L1 Working Brief** — concise headings, important facts/tables, open questions, provenance.
- **L2 Canonical Notes** — detailed source-preserving Markdown.

Recommended frontmatter:

```yaml
source:
retrieved_at:
content_type:
provenance:
confidence:
```

Keep exact dates, amounts, requirements, numbered clauses, table relationships, uncertainty, and source pointers. Remove navigation, duplicate prose, decorative markup, and low-signal boilerplate.

## Token-saving rule

Load L0 by default. Load L1 while working on the topic. Load only the relevant L2 section when evidence or detail is required.

Compression is not verification: important claims still need comparison against the original artifact.
