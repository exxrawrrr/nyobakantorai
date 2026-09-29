---
name: nyoba-test-driven-delivery
description: Use when implementing a feature, bugfix, adapter, workflow, or behavior whose expected outcome can be pinned by executable tests or deterministic checks.
version: 1.0.0
author: nyobakantorai
license: MIT
platforms: [windows, linux, macos]
metadata:
  provenance_mode: recreated
  source_ids: [superpowers, ecc]
---

# Test-Driven Delivery

## Loop
`RED → GREEN → REFACTOR → VERIFY`

- Write the smallest test/check that expresses the desired behavior.
- Run it and confirm it fails for the intended reason.
- Implement only enough to make it pass.
- Run the focused test, then the relevant wider suite.
- Refactor only while tests remain green.
- For regressions, prove the test would fail without the fix when practical.

Avoid tests that merely mirror implementation details or always pass. For non-code workflows, use deterministic acceptance checks and negative cases instead of pretending prose is a test.

