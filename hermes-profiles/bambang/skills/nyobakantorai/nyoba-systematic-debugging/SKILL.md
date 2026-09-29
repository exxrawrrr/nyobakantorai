---
name: nyoba-systematic-debugging
description: "Use when software, automation, integrations, tools, or agent runs fail repeatedly, behave inconsistently, or tempt repeated blind retries."
license: MIT
compatibility: "Hermes-first; follows the Agent Skills SKILL.md core format."
metadata:
  nyoba-version: "1.0.0"
  nyoba-author: "nyobakantorai"
  nyoba-platforms: "windows,linux,macos"
---

# Systematic Debugging

Stop random retries.

1. **Reproduce** the smallest reliable failure.
2. **Capture** exact error, inputs, environment assumptions, last known-good state.
3. **Classify** logic / state / environment / auth / policy / race / external dependency.
4. **Hypothesize** one likely cause at a time.
5. **Discriminate** with the smallest observation or test that can falsify it.
6. **Fix** the root cause with the smallest reversible change.
7. **Verify** the original symptom and relevant regression surface.
8. **Reflect** only after fresh evidence shows the result.

If retries do not create new information, stop. If the failure crosses an approval/security boundary, escalate instead of debugging around the boundary.

