---
name: nyoba-strategic-context-compaction
description: "Use when a long multi-phase task is accumulating low-signal context or crossing a natural research, planning, implementation, debugging, or review boundary."
license: MIT
compatibility: "Hermes-first; follows the Agent Skills SKILL.md core format."
metadata:
  nyoba-version: "1.0.0"
  nyoba-author: "nyobakantorai"
  nyoba-platforms: "windows,linux,macos"
---

# Strategic Context Compaction

## Principle
Compact at **logical boundaries**, never because the conversation merely feels long.

Before reducing context, write a durable Markdown checkpoint containing:
- objective and current phase;
- decisions and constraints;
- exact artifacts/paths/IDs;
- completed verification;
- blockers and unresolved questions;
- next three actions.

Good boundaries: research → plan, plan → implementation, debugging → unrelated work, completed milestone → next milestone.

Do not compact mid-edit, mid-debug hypothesis, or before critical details are persisted.

## Token discipline
Prefer progressive disclosure:
1. L0 — one-screen state summary.
2. L1 — working brief for the current phase.
3. L2 — linked evidence/source documents loaded only when needed.

After compaction, re-open the checkpoint and verify the next action against current state instead of trusting the summary blindly.

