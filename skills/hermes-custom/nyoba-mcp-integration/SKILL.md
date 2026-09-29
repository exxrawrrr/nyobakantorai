---
name: nyoba-mcp-integration
description: "Design MCP/API/plugin/connector integrations with explicit auth, capability, health, and failure boundaries."
license: MIT
compatibility: "Hermes-first; follows the Agent Skills SKILL.md core format."
metadata:
  nyoba-version: "1.0.0"
  nyoba-author: "nyobakantorai"
  nyoba-platforms: "windows,linux,macos"
  nyoba-hermes-tags: "nyobakantorai,workforce,v0.3"
---

# MCP / integration engineering

## Procedure
Keep these distinct: model, SOUL, skill, tool, toolset, plugin, connector, MCP server, API, credential, authorization.
Define protocol, capability names, trust boundary, auth owner, read/write scope, health check, timeout, error states, observability, and rollback before implementation.
Prefer native Hermes toolsets/plugins/MCP support over duplicate mechanisms.

## Verification
Show connection evidence separately from action evidence. A configured server is not a connected server; a connected server is not proof an action executed.
