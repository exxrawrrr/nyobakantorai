# Acknowledgements and upstreams

nyobakantorai is its own project, but it did not appear in a vacuum. This file distinguishes runtime dependencies from design inspiration so credit stays accurate.

## Primary runtime: Hermes Agent

- Project: **Hermes Agent**
- Upstream: https://github.com/NousResearch/hermes-agent
- Maintainer / origin: Nous Research
- License: MIT
- Relationship: **primary/reference agent runtime** for nyobakantorai. The public office reads Hermes profiles and Kanban state through a conservative adapter, and the repository ships native Hermes profile distributions for its canonical workforce.

nyobakantorai does **not** vendor Hermes source code or Hermes credentials. Users install Hermes from its upstream project and keep provider configuration, auth, billing, sessions, memories, and runtime state in their own Hermes home.

## Visual interaction inspiration: Pixel Agents

- Project: **Pixel Agents**
- Upstream: https://github.com/pixel-agents-hq/pixel-agents
- Origin / publisher: Pablo De Lucca (`pablodelucca`); current canonical GitHub organization: `pixel-agents-hq`
- License: MIT
- Relationship: **visual/interaction inspiration** for the idea of agents represented as animated workers in an office.

The current nyobakantorai office is not presented as a fork of Pixel Agents. Its public character sprites, task registry, evidence model, approval model, adapter layer, and office implementation are maintained here. Where a future file is directly derived from an upstream project, that file should carry explicit provenance instead of relying on this general acknowledgement.

## Tooling and ecosystem

- GitHub / GitHub Actions host source, issues, CI, release artifacts, security scanning, and branch protection.
- Node.js provides the zero-runtime-dependency office server.
- Python + PyYAML are used by developer/release utilities and are not required just to run the office UI.

If an upstream project materially contributes code or design to nyobakantorai in the future, add it here in the same change that introduces that dependency.
## Skill, memory, and document workflow sources

The v0.3 workforce enrichment uses **recreated concepts** (not unattributed copies) from permissively licensed projects including ECC, Superpowers, MarkItDown, Docling, Mem0, Letta, Jina Reader, MCP reference servers, and Anthropic's Apache-2.0 `mcp-builder` skill. Exact source commits, licenses, and usage mode are recorded in `config/upstream-sources.json` and `docs/UPSTREAM-SOURCE-CATALOG.md`.

Anthropic PDF/DOCX document skills with restrictive skill-specific terms are intentionally excluded from copying/derivation.
