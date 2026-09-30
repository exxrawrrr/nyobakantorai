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
| [Agent Skills](https://github.com/agentskills/agentskills) | Apache-2.0 | Open skill-format / progressive-disclosure compatibility reference |
| [GitHub awesome-copilot](https://github.com/github/awesome-copilot) | MIT | Discovery/reference for agent, skill, hook, and plugin patterns; not bulk-vendored |
| [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) | Apache-2.0 | Extension architecture reference for skills + MCP + hooks composition |
| [Repomix](https://github.com/yamadashy/repomix) | MIT | Optional codebase context packing and token-aware include/exclude workflow |
| [Microsoft LLMLingua](https://github.com/microsoft/LLMLingua) | MIT | Experimental lossy prompt-compression research only, fidelity-gated |
| [Cognee Integrations](https://github.com/topoteretes/cognee-integrations) | Apache-2.0 | Candidate Hermes memory integration; evaluation-only until isolation/export/deletion tests pass |
| [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) | Apache-2.0 | Optional structured browser capability candidate with guarded external interaction |
| [Browser Use](https://github.com/browser-use/browser-use) | MIT | Higher-level browser-agent comparison/evaluation candidate |
| [GoogleChrome Lighthouse](https://github.com/GoogleChrome/lighthouse) | Apache-2.0 | Optional Ratri web-performance/SEO/accessibility audit tool |
| [Polars](https://github.com/pola-rs/polars) | MIT | Optional Paijo/Nara local structured-data analysis tool |

## Explicit exclusion

Anthropic's PDF/DOCX document skills have skill-specific restrictive terms. They are **not copied, vendored, or used to make derivative document skills** here. We instead use permissive document tooling/reference projects such as MarkItDown, Docling, and Jina Reader.

## Adaptation policy

Most new skills in `skills/hermes-custom/` are **recreated**: they express general workflows in nyobakantorai's own wording and safety model rather than copying upstream prose. Each recreated skill lists `source_ids` in frontmatter. Exact vendoring, if ever introduced, must preserve the upstream license and notices in the same change.


## Research pins

Exact reviewed commit SHAs and usage modes are machine-readable in `config/upstream-sources.json`. The catalog intentionally pins research snapshots so a future upstream change does not silently rewrite what nyobakantorai claims to have reviewed.

An upstream appearing here does **not** mean it is bundled, installed, connected, or authorized. `config/integrations.json` carries that separate state.
