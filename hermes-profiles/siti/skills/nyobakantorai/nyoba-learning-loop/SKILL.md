---
name: nyoba-learning-loop
description: Turn corrections and verified outcomes into reusable lessons and governed skill improvements.
version: 1.0.0
author: nyobakantorai
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [nyobakantorai, reflection, learning, skills, v0.3]
    requires_toolsets: [memory, session_search, skills]
---

# Reflection and learning loop

## Trigger
Use after a user correction, failed attempt, verified complex task, or repeated pattern.

## Loop
1. Recall relevant prior sessions and profile memory.
2. Compare expected outcome, actual outcome, evidence, correction, and root cause.
3. Distill the smallest reusable rule or checklist item.
4. Persist a compact profile lesson when durable.
5. If repeated or explicitly requested, use Hermes native skill learning to draft a runtime-local improvement.
6. Apply the lesson on the next similar task and record whether it helped.
7. Replace or remove lessons disproved by newer evidence.

## Guardrails
Never self-upgrade autonomy, permissions, approval rules, verification policy, or identity. Canonical repository skill changes are proposals that require review/PR. Cross-profile learning requires explicit handoff or an approved shared-memory provider.

## Verification
Learning requires a memory receipt, session-search trace, runtime-local skill receipt, or reviewed repository change; otherwise report LESSON_NOT_PERSISTED.

## Sources and adaptation
Inspired by NousResearch/hermes-agent (MIT), mem0ai/mem0 (Apache-2.0), and mohitagw15856/pm-claude-skills (MIT). No source code or long-form source text is copied.
