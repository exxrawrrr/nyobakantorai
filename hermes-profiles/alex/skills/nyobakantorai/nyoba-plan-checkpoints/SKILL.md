---
name: nyoba-plan-checkpoints
description: Turn multi-step work into owned, testable checkpoints with explicit dependencies and receipts.
version: 1.0.0
author: nyobakantorai
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [nyobakantorai, planning, operations, v0.3]
---

# Plan with checkpoints

## Procedure
1. Restate outcome, non-goals, constraints, approvals, and source of truth.
2. Split work into independently testable deliverables.
3. For each checkpoint record owner, inputs, output, dependency, acceptance evidence, and rollback/escalation.
4. Keep handoffs proposed until accepted.
5. Compare actual state to plan at each checkpoint and update drift explicitly.
6. Track open loops as we owe / they owe / we promised.
7. Close only when acceptance evidence exists.

## Sources and adaptation
Inspired by obra/superpowers writing-plans (MIT) and mohitagw15856/pm-claude-skills follow-up/project workflows (MIT). Rewritten for nyobakantorai.
