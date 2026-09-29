---
name: nyoba-plan-execute-review
description: "Use when a task spans multiple files, systems, owners, or dependent steps and needs an implementation plan that another worker can execute and review."
license: MIT
compatibility: "Hermes-first; follows the Agent Skills SKILL.md core format."
metadata:
  nyoba-version: "1.0.0"
  nyoba-author: "nyobakantorai"
  nyoba-platforms: "windows,linux,macos"
  nyoba-provenance-mode: "recreated"
  nyoba-source-ids: "superpowers"
---

# Plan → Execute → Review

A useful plan carries decisions the executor cannot safely invent.

For each task unit define:
- outcome;
- exact owner;
- files/systems touched;
- dependencies;
- acceptance evidence;
- rollback or stop condition;
- approval class if external/high-impact.

Keep tasks independently reviewable. Execute in dependency order. At each boundary:
1. verify the completed unit;
2. update task truth;
3. hand off artifact + evidence;
4. review requirements before opening the next unit.

Do not expand scope silently. If implementation reveals a design change, return to the plan instead of hiding the change inside execution.

