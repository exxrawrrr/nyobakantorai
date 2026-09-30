---
name: nyoba-paid-media-safety
description: "Apply guarded paid-media lifecycle, approval boundaries, paused-by-default creation, and post-mutation verification."
license: MIT
compatibility: "Hermes-first; follows the Agent Skills SKILL.md core format."
metadata:
  nyoba-version: "1.0.0"
  nyoba-author: "nyobakantorai"
  nyoba-platforms: "windows,linux,macos"
  nyoba-hermes-tags: "nyobakantorai,workforce,v0.3"
---

# Paid media safety

## Procedure
Use READ → ANALYZE → PREVIEW → VALIDATE → APPROVAL → EXECUTE → VERIFY → AUDIT for paid-media changes.
Default to GUARDED mode. Never silently spend money, activate a campaign, change billing/account settings, or expand the target beyond approval.
Campaign/ad creation should remain PAUSED until activation is explicitly approved. Distinguish tool availability, connection state, execution receipt, delivery state, and verified outcome.

## Verification
For any mutation, require provider/account target, before-state, approved diff, execution receipt, after-state readback, and residual risk.
