---
name: nyoba-markdown-knowledge-compaction
description: "Use when documents, web pages, meeting notes, reports, PDFs, office files, or long research need a source-preserving Markdown representation or token-efficient working brief."
license: MIT
compatibility: "Hermes-first; follows the Agent Skills SKILL.md core format."
metadata:
  nyoba-version: "1.0.0"
  nyoba-author: "nyobakantorai"
  nyoba-platforms: "windows,linux,macos"
---

# Markdown Knowledge Compaction

## Primary owner
Fikri is the default knowledge/Markdown steward. Other workers may consume this skill for their own domain.

## Conversion order
Use the narrowest available path:
1. trusted text/Markdown already available → normalize directly;
2. MarkItDown / `markitdown-mcp` when connected for common local/remote documents;
3. Docling-style structured extraction when complex layout, tables, or document structure matter;
4. Reader-style web → readable Markdown for web pages;
5. manual extraction when no converter is connected.

A converter is a tool, not a truth oracle. Preserve source references and verify important numbers/clauses against the original.

## Canonical Markdown shape
Use YAML frontmatter when saving durable knowledge:
```yaml
source:
retrieved_at:
content_type:
provenance:
confidence:
```

Then create layers:
- **L0 Executive** — ~100–200 words, decisions and alerts.
- **L1 Working Brief** — compact sections, key facts, tables, actions, open questions.
- **L2 Canonical Notes** — detailed source-preserving Markdown with quotations kept minimal and legal/numeric structure intact.

## Compression rules
Remove navigation, boilerplate, duplicated prose, decorative markup, and repeated explanations. Keep:
- headings and hierarchy;
- tables when relationships matter;
- exact dates, amounts, thresholds, requirements;
- source links / page or section pointers;
- uncertainty and contradictions.

Never compress away a caveat that changes a decision.

