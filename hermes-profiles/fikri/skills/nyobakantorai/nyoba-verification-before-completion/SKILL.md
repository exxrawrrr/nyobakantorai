---
name: nyoba-verification-before-completion
description: Require fresh evidence before claiming work or external actions are complete.
version: 1.0.0
author: nyobakantorai
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [nyobakantorai, verification, qa, v0.3]
---

# Verification before completion

## Gate
Before DONE, FIXED, PASS, LIVE, DEPLOYED, SENT, or PAID:
1. Name the evidence that proves the exact claim.
2. Obtain fresh evidence from the original system, artifact, test, receipt, or provider.
3. Read full result and failure/status output.
4. Match evidence scope to claim scope.
5. Record remaining unverified areas.
6. Only then update task state.

## Independent review
The producer cannot independently verify its own work.

## Sources and adaptation
Adapted conceptually from obra/superpowers verification-before-completion (MIT), rewritten around nyobakantorai task truth.
