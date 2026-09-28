---
name: nyoba-manual-chatgpt-handoff
description: Create human-operated task/result packets without impersonating the owner's private ChatGPT Plus conversation.
version: 1.0.0
author: nyobakantorai
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [nyobakantorai, agents, workflow]
---

# Manual ordinary ChatGPT handoff

## When to use and procedure
Use whenever an employee task targets the owner's ordinary ChatGPT chat, ChatGPT Image or connected ChatGPT apps.
Set surface=MANUAL_CHATGPT and state=WAITING_CHATGPT_HANDOFF; Hermes does NOT automatically invoke a personal ChatGPT conversation or inherit its plugins.
Produce a copy-paste packet with task ID only if real, employee, objective, inputs truly accessible to recipient, privacy, prohibited actions, acceptance criteria and reply location.
Owner must genuinely open the relevant chat and submit the packet. Record actual returned work and provenance only after it exists. Mark an image prompt DRAFT until a file was actually generated.
Verify: owner can distinguish a draft handoff from a real sent request and a manual result from a verified Hermes run.

## Verification
Do not claim an external action, ChatGPT execution, or independent QA unless a genuine receipt exists.
