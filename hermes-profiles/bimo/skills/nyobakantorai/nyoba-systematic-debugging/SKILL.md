---
name: nyoba-systematic-debugging
description: Debug from evidence and root cause before changing systems.
version: 1.0.0
author: nyobakantorai
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [nyobakantorai, engineering, debugging, v0.3]
---

# Systematic debugging

## Procedure
1. Reproduce the failure and read complete errors before editing.
2. Identify the failing boundary: input, state, config, dependency, transport, code, environment, or permission.
3. Compare with a known-working path.
4. State one root-cause hypothesis with evidence.
5. Test the smallest reversible change.
6. Add a regression check for the original symptom.
7. After repeated failed fixes, stop stacking patches and reconsider architecture with the owner.

## Verification
Re-run the original reproduction plus relevant regression and negative tests.

## Sources and adaptation
Adapted conceptually from obra/superpowers systematic-debugging (MIT), rewritten for nyobakantorai. No source code copied.
