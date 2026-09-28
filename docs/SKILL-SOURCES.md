# Skill sources and adaptations

nyobakantorai adapts concepts; it does **not** silently copy third-party skill text or code. Every externally inspired skill below is rewritten around human approval, task truth, profile-scoped memory, and independent verification.

| Skill | Sources | License(s) | Adaptation |
| --- | --- | --- | --- |
| `nyoba-memory-stewardship` | Hermes Agent, Mem0, Letta, Cognee, MCP reference memory | MIT / Apache-2.0 / MCP transition | memory scoping, curation, retrieval |
| `nyoba-learning-loop` | Hermes Agent, Mem0, PM Claude Skills | MIT / Apache-2.0 | reflection → durable lesson → governed skill improvement |
| `nyoba-systematic-debugging` | Superpowers | MIT | root-cause-first debugging |
| `nyoba-verification-before-completion` | Superpowers | MIT | fresh evidence before completion claims |
| `nyoba-plan-checkpoints` | Superpowers, PM Claude Skills | MIT | testable plans + open-loop follow-up |
| `nyoba-browser-research-ops` | Browser Use | MIT | bounded browser-agent evidence gathering |
| `nyoba-social-publishing-ops` | Publora Skills | MIT | cross-platform publishing payload/receipt concepts |
| `nyoba-experiment-readout` | PM Claude Skills | MIT | honest experiment readout, guardrails, validity checks |

## Primary links

- https://github.com/NousResearch/hermes-agent
- https://github.com/mem0ai/mem0
- https://github.com/letta-ai/letta
- https://github.com/topoteretes/cognee
- https://github.com/obra/superpowers
- https://github.com/browser-use/browser-use
- https://github.com/modelcontextprotocol/servers
- https://github.com/anthropics/claude-plugins-official
- https://github.com/publora/skills
- https://github.com/mohitagw15856/pm-claude-skills

## Governance boundary

Runtime-local Hermes memory/skill evolution belongs to the user's profile. Canonical distributed skills in this repository change through source review/PR. Learning must never silently widen permissions, autonomy, account access, verification authority, or secret scope.
