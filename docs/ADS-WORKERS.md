# Advertising workers

**Status: IMPLEMENTED / NOT LIVE-ACCOUNT VERIFIED**

Maya (Meta Ads) and Gugun (Google Ads) are provider-neutral consumers. No Meta Ads Official, AdVantage, Composio, or closed-plugin implementation is copied into this repository.

## Meta contract

`ads.meta.read`, `ads.meta.insights`, `ads.meta.creative`, `ads.meta.write`, `ads.meta.media`

## Google contract

`ads.google.read`, `ads.google.insights`, `ads.google.keywords`, `ads.google.creative`, `ads.google.write`, `ads.google.verify`

Default state is `NOT_CONNECTED`. Without a provider, Maya/Gugun can reason over user-supplied data and produce previews, but execution is **BLOCKED**.

Mutation lifecycle:

```text
READ → ANALYZE → PREVIEW → VALIDATE → APPROVAL → EXECUTE → VERIFY → AUDIT
```

## Meta media limitation

A chat/local attachment is not automatically a Meta media-library asset. A future bridge may implement:

```text
local attachment → temporary scoped media bridge → provider upload
→ provider media asset/hash → creative → ad
```

This repo does not create an insecure public bucket and does not claim that media bridge is solved. A future `adops-mcp` can implement these contracts independently.
