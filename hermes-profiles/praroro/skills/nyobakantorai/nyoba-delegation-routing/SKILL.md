---
name: nyoba-delegation-routing
description: Route work deterministically by expertise, preserve human assignment, and require handoff receipts.
version: 1.0.0
author: nyobakantorai
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [nyobakantorai, workforce, v0.3]
---

# Delegation and routing

## Procedure
1. Respect an explicit human assignee; routing suggestions never override it.
2. Match the request to the canonical employee registry using aliases, routing keywords, expertise, tool expectations, and risk.
3. Prefer the smallest complementary team. Name owner, support role, expected artifact, approval boundary, and verification owner.
4. A proposed handoff is not execution. Record a real acceptance/runtime receipt before claiming delegation happened.

## Verification
Report the selected worker(s), why each matched, unresolved capability dependencies, and the handoff receipt or BLOCKED state.
