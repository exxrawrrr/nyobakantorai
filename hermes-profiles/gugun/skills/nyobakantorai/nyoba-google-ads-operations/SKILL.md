---
name: nyoba-google-ads-operations
description: Analyze and operate Google Ads through provider-neutral capabilities with preview, approval, and verification.
version: 1.0.0
author: nyobakantorai
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [nyobakantorai, workforce, v0.3]
---

# Google Ads operations

## Scope
Search, Display, remarketing, campaigns, ad groups, RSA, keywords, negatives, search terms, geo, audiences, budgets, bidding concepts, conversions, and assets.

## Procedure
Use provider-neutral capabilities: ads.google.read, insights, keywords, creative, write, verify.
Prefer READ → ANALYZE → PREVIEW → VALIDATE → APPROVAL → EXECUTE → VERIFY → AUDIT.
If the provider is unavailable, produce a plan from supplied data and mark execution BLOCKED.

## Verification
Record target account/campaign, exact proposed diff, approval, mutation receipt, and independent post-write readback.
