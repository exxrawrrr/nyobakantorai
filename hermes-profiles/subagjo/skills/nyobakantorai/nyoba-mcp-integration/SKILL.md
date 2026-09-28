---
name: nyoba-mcp-integration
description: Design MCP/API/plugin/connector integrations with explicit auth, capability, health, and failure boundaries.
version: 1.0.0
author: nyobakantorai
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [nyobakantorai, workforce, v0.3]
---

# MCP / integration engineering

## Procedure
Keep these distinct: model, SOUL, skill, tool, toolset, plugin, connector, MCP server, API, credential, authorization.
Define protocol, capability names, trust boundary, auth owner, read/write scope, health check, timeout, error states, observability, and rollback before implementation.
Prefer native Hermes toolsets/plugins/MCP support over duplicate mechanisms.

## Verification
Show connection evidence separately from action evidence. A configured server is not a connected server; a connected server is not proof an action executed.
