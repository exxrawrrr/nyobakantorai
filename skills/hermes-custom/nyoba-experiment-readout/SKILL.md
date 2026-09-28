---
name: nyoba-experiment-readout
description: Read experiments with statistical and practical significance, guardrails, and validity checks.
version: 1.0.0
author: nyobakantorai
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [nyobakantorai, experiment, analytics, growth, v0.3]
---

# Experiment readout

## Procedure
1. Capture hypothesis, primary metric, guardrails, planned sample/duration, variants, and raw counts or summary statistics.
2. Compute effect with uncertainty when supported; do not eyeball significance.
3. Separate statistical from practical significance.
4. Check sample ratio, early stopping/peeking, seasonality, novelty, attribution changes, and guardrail harm.
5. Return SHIP / DO_NOT_SHIP / ITERATE / RE-RUN / INCONCLUSIVE with evidence.
6. Persist a lesson only after the readout is verified.

## Sources and adaptation
Inspired by mohitagw15856/pm-claude-skills experiment-readout (MIT), rewritten for nyobakantorai.
