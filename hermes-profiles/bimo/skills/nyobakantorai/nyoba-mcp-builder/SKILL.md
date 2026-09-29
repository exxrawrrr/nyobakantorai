---
name: nyoba-mcp-builder
description: Use when designing, implementing, evaluating, or reviewing an MCP server or connector and the capability, transport, authentication, scopes, and failure semantics must be explicit.
version: 1.0.0
author: nyobakantorai
license: MIT
platforms: [windows, linux, macos]
metadata:
  provenance_mode: recreated
  source_ids: [anthropic-mcp-builder, mcp-reference-servers, superpowers]
---

# MCP Builder

Start from a capability contract, not a pile of tools.

## Design
Define:
- who owns the server and credentials;
- transport (stdio / HTTP) and trust boundary;
- tool/resource names and schemas;
- read vs write vs paid/destructive classes;
- auth scopes and least privilege;
- idempotency/retry behavior;
- timeout/error taxonomy;
- audit/evidence returned after actions.

Prefer narrow tools with typed inputs and useful error messages. Never expose secrets as tool output.

## Evaluation
Test:
- happy path;
- invalid input;
- unauthorized/missing credential;
- unavailable dependency;
- duplicate/retry behavior;
- high-impact approval enforcement;
- tool output that is untrusted/malicious text;
- shutdown/reconnect.

Use the official MCP Inspector or equivalent connected tooling when available. A server that starts is not evidence that its tools are correct or authorized.

