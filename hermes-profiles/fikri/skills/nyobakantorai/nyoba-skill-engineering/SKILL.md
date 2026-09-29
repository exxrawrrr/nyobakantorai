---
name: nyoba-skill-engineering
description: Use when a repeated lesson, workflow, or failure pattern may deserve promotion from memory into a reusable skill, or when an existing skill needs to be strengthened.
version: 1.0.0
author: nyobakantorai
license: MIT
platforms: [windows, linux, macos]
metadata:
  provenance_mode: recreated
  source_ids: [superpowers, ecc]
---

# Skill Engineering

Do not turn every anecdote into permanent instructions.

## Promotion gate
A candidate lesson should normally have:
- 3+ independent supporting observations or a strong explicit human rule;
- a stable trigger;
- a reusable action;
- evidence that the pattern improves outcomes;
- no hidden project-specific assumption.

## Skill TDD
1. Write pressure scenarios that expose the failure without the skill.
2. Record the baseline mistake/rationalization.
3. Write the minimal skill that closes the gap.
4. Re-run scenarios and verify behavior changes.
5. Add counterexamples and "when not to use".
6. Attribute upstream sources and license if concepts were adapted.
7. Human-review before promotion into canonical/shared skills.

Descriptions should explain **when to load the skill**, not summarize the whole procedure. Mechanical rules that can be enforced in code/tests belong in automation, not prose.

