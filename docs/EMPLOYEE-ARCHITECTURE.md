# Employee architecture

v0.3 treats an employee as a package, not an avatar.

```text
IDENTITY + PERSONALITY + ROLE + EXPERTISE + HABITS + SKILLS
+ TOOLSET PREFERENCES + OPTIONAL EXTERNAL CAPABILITIES
+ APPROVAL + VERIFICATION + MEMORY + HANDOFF RULES
```

The canonical source is `config/employees.json`. Generated SOUL/profile distributions and office workforce metadata must match it; `npm run workforce:check` fails on drift.

## Layers

- **SOUL** — who the employee is: role, personality, communication, habits, decision style.
- **SKILL** — reusable procedure or knowledge. A skill is not permission.
- **TOOL / TOOLSET** — executable Hermes capability. Preference is not proof the backend is available.
- **MCP / connector** — external capability connection with its own authentication and scopes.
- **PROFILE** — complete installable Hermes worker package.
- **CREDENTIALS** — user-owned runtime state; never bundled here.

The first six workers retain owner-authored sprites. The ten v0.3 workers deliberately use `pending-original-art` placeholders until original art exists. Animation and visual state never prove execution.

## Routing and handoff

`lib/routing.mjs` performs deterministic registry-keyword routing. Human assignment always wins. Routing creates a proposal, not execution. A real handoff still needs a receiving-runtime receipt and task provenance.

## Verification

Every registry entry has `self_verify: false`. Reviewer candidates are explicit. Siti can review other workers but cannot independently verify Siti's own work. VERIFIED requires independent evidence.
