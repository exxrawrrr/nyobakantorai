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

## Skill/workflow inspirations

The following projects informed rewritten nyobakantorai procedures. Source code and long-form source text are not vendored into the skills; provenance and license metadata live in `config/skill-sources.json` and `docs/SKILL-SOURCES.md`.

- Mem0 — https://github.com/mem0ai/mem0 — Apache-2.0
- Letta — https://github.com/letta-ai/letta — Apache-2.0
- Cognee — https://github.com/topoteretes/cognee — Apache-2.0
- Superpowers — https://github.com/obra/superpowers — MIT
- Browser Use — https://github.com/browser-use/browser-use — MIT
- Model Context Protocol reference servers — https://github.com/modelcontextprotocol/servers — Apache-2.0 / legacy MIT transition
- Anthropic Claude plugins directory — https://github.com/anthropics/claude-plugins-official — Apache-2.0 for Anthropic repository; third-party plugin licenses vary
- Publora Skills — https://github.com/publora/skills — MIT
- PM Claude Skills — https://github.com/mohitagw15856/pm-claude-skills — MIT
