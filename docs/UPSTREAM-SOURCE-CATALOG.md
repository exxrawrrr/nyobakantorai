# Upstream source catalog

nyobakantorai uses upstream work carefully: **source is always named, license is checked, and adaptation mode is explicit**.

| Source | License | How nyobakantorai uses it |
| --- | --- | --- |
| [Everything Claude Code / ECC](https://github.com/affaan-m/ECC) | MIT | Recreated concepts for memory, continuous learning, compaction, research, introspection |
| [Superpowers](https://github.com/obra/superpowers) | MIT | Recreated workflow patterns for brainstorming, debugging, TDD, verification, planning, skill engineering; optional native Hermes plugin |
| [Anthropic mcp-builder](https://github.com/anthropics/skills/tree/main/skills/mcp-builder) | Apache-2.0 | Recreated MCP design/evaluation concepts only |
| [Microsoft MarkItDown](https://github.com/microsoft/markitdown) | MIT | Optional local MCP + document→Markdown reference |
| [Docling](https://github.com/docling-project/docling) | MIT | Structured document extraction/chunking reference |
| [Jina Reader](https://github.com/jina-ai/reader) | Apache-2.0 | Web→Markdown/readability reference |
| [Mem0](https://github.com/mem0ai/mem0) | Apache-2.0 | Memory lifecycle/scoping reference |
| [Letta](https://github.com/letta-ai/letta) | Apache-2.0 | Stateful-agent learning/memory reference |
| [MCP reference servers](https://github.com/modelcontextprotocol/servers) | MIT / repository notices | MCP and memory-server design reference |

## Explicit exclusion

Anthropic's PDF/DOCX document skills have skill-specific restrictive terms. They are **not copied, vendored, or used to make derivative document skills** here. We instead use permissive document tooling/reference projects such as MarkItDown, Docling, and Jina Reader.

## Adaptation policy

Most new skills in `skills/hermes-custom/` are **recreated**: they express general workflows in nyobakantorai's own wording and safety model rather than copying upstream prose. Each recreated skill lists `source_ids` in frontmatter. Exact vendoring, if ever introduced, must preserve the upstream license and notices in the same change.
