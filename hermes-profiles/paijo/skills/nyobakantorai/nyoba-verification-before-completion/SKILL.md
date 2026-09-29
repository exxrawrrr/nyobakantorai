---
name: nyoba-verification-before-completion
description: "Use immediately before claiming a task, change, delivery, deployment, analysis, or handoff is complete, correct, passing, sent, or verified."
license: MIT
compatibility: "Hermes-first; follows the Agent Skills SKILL.md core format."
metadata:
  nyoba-version: "1.0.0"
  nyoba-author: "nyobakantorai"
  nyoba-platforms: "windows,linux,macos"
  nyoba-provenance-mode: "recreated"
  nyoba-source-ids: "superpowers"
---

# Verification Before Completion

No completion claim without **fresh evidence**.

Before a success statement:
1. name the evidence that would prove it;
2. run/read the full verification surface available now;
3. inspect exit status/result, not just reassuring log fragments;
4. compare result to acceptance criteria;
5. report PASS, PARTIAL, BLOCKED, or FAIL with evidence.

Examples:
- tests pass → fresh test output with zero failures;
- external write succeeded → provider receipt + read-back when possible;
- document correct → original/source comparison;
- handoff accepted → receiving receipt, not sender intent;
- analysis validated → definitions, source set, and recomputation.

Confidence, agent self-report, animation, draft state, and previous CI are not fresh verification.

