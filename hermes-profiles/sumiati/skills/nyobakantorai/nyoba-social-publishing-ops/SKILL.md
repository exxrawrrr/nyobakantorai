---
name: nyoba-social-publishing-ops
description: Prepare and safely publish multi-channel social content through an explicitly connected provider.
version: 1.0.0
author: nyobakantorai
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [nyobakantorai, social, publishing, community, v0.3]
---

# Social publishing operations

## Procedure
1. Identify channel, target account/page, audience, claims, media, and platform constraints.
2. Draft channel-specific copy.
3. Validate claims, links, media provenance, and intended account.
4. If no publishing provider is connected, stop at DRAFT_READY.
5. Publishing/scheduling is an external write: preview exact payload and require scoped approval unless delegated policy covers it.
6. Verify provider post/schedule state and record receipt.

## Sources and adaptation
Inspired by publora/skills social-post (MIT), rewritten provider-neutral. No Publora code or credentials are bundled.
