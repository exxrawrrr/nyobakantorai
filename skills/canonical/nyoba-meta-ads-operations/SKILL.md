---
name: nyoba-meta-ads-operations
description: "Plan and operate Meta Ads through provider-neutral capabilities without pretending account access."
license: MIT
compatibility: "Hermes-first; follows the Agent Skills SKILL.md core format."
metadata:
  nyoba-version: "1.0.0"
  nyoba-author: "nyobakantorai"
  nyoba-platforms: "windows,linux,macos"
  nyoba-hermes-tags: "nyobakantorai,workforce,v0.3"
---

# Meta Ads operations

## Scope
Campaign/ad set/ad structure, audiences, placements, creative tests, pacing, diagnostics, change history, and media-library concepts.

## Procedure
Use provider-neutral capabilities: ads.meta.read, ads.meta.insights, ads.meta.creative, ads.meta.write, ads.meta.media.
If a capability is NOT_CONNECTED/PARTIAL/ERROR, analyze supplied evidence and return BLOCKED for unavailable actions.
Treat local/chat attachments as not-yet-Meta media. Media needs a trusted bridge/upload, a Meta asset identity/hash, then creative/ad linkage.

## Verification
Never claim a Meta change until a write receipt is followed by readback/change-history evidence. Paid writes require explicit approval.
