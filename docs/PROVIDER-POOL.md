# KANTORAI provider pool

**Status: operator-lab prepared on one Windows GROWTH installation — 2026-10-04**

This document records an **optional specialist-provider pool** for KANTORAI. It does not change the canonical employee identities, production default provider, approval gates, or Telegram routing.

## Locked routing policy

Production employee profiles stay on the existing Hermes/Nous path by default:

```text
employee SOUL/profile
        |
        +-- normal turn ----------> Nous / nous-welcome
        |
        +-- explicit specialist --> provider broker
                                    |-- Qwen local
                                    |-- DeepSeek local
                                    |-- Gemini API
                                    `-- Codex, when explicitly selected for engineering work
```

A provider is a **resource**, not a replacement employee identity. Switching or consulting a provider must not replace the employee's SOUL, role, permission boundary, or provenance.

The operational rule remains:

`configured != connected != executed != succeeded != verified`

## Verified production isolation

After preparing the provider pool on the operator machine, production was rechecked:

- 16/16 employee profiles were still present in Hermes.
- KANTORAI Office on `127.0.0.1:4322` reported healthy, `LOCAL_ONLY`, dispatch disabled.
- Hermes Dashboard on `127.0.0.1:9119` returned HTTP 200.
- The employee inference proxy on `127.0.0.1:8645` continued to expose `nous/welcome`.
- Telegram profile mappings were not changed.
- No employee was switched to Ollama, Gemini, DeepSeek API, or Codex by this setup.

## Ollama local runtime

The operator machine uses a standalone Ollama runtime under an operations directory on drive D rather than installing it into the KANTORAI or Hermes source repositories.

Verified runtime:

- Ollama version: `0.35.1`
- Official Windows standalone package was downloaded completely.
- Package SHA-256 matched the official release digest:
  `dc50b9ca7f9023c86525012632cd1615b093d0407987444a7f62ecab617e8e93`
- Ollama listens only on `127.0.0.1:11434` when started.
- Idle server is stopped when not needed.

### Finalized local models

Two model pulls completed Ollama's own digest verification and manifest write:

| Lab | Model | Approx. size | State |
| --- | --- | ---: | --- |
| low-memory utility | `qwen3:0.6b` | 523 MB | installed / manifest verified |
| local reasoning | `deepseek-r1:1.5b` | 1.12 GB | installed / manifest verified |

The DeepSeek route above is the **local open-weight model through Ollama**. The metered DeepSeek API is not enabled by this operator setup.

## Hardware / memory guard

The tested GROWTH machine has approximately:

- Intel Core i5-8350U
- 7.88 GB usable RAM
- Intel UHD Graphics 620
- no discrete GPU selected by Ollama

During the 2026-10-04 test window, only about 1 GB of physical RAM remained free after the normal office/browser workload.

For that reason, local inference is intentionally **fail-closed** when free RAM is below 2 GB. Installing a model is not treated as proof that inference is safe or usable.

Current evidence therefore distinguishes:

- Ollama runtime installed: **PASS**
- Qwen model downloaded + verified: **PASS**
- DeepSeek local model downloaded + verified: **PASS**
- Real local inference under acceptable memory headroom: **PENDING**
- Production routing to a local model: **NOT ENABLED**

## Gemini lab

Hermes has native Google Gemini support through provider `gemini`.

The isolated lab is configured for a Gemini Flash model and the native Gemini API endpoint. It intentionally has **no Google credential committed to source**.

Important distinction:

- A consumer Gemini subscription does not automatically prove API quota for Hermes.
- The lab requires a Google AI Studio API key (free-tier project when eligible, otherwise its configured API billing/quota).
- The key must be entered locally and never committed or pasted into chat/logs.

Current state:

- Gemini lab config: **prepared**
- Gemini credential: **pending operator authorization**
- Gemini live inference: **pending**

## Provider broker

An operator-local broker was prepared for explicit specialist calls:

- `qwen`
- `deepseek`
- `gemini`

The broker is intentionally advisory:

1. It does not silently replace an employee's provider.
2. It does not bypass write/spend approval.
3. Provider output is not evidence by itself.
4. A verifier such as Siti may independently review provider output.
5. Usage receipts are kept by the operator lab.
6. Production rollout must be a separate, explicit decision after provider-specific live tests pass.

## Suggested role mapping after live tests

These are design recommendations, not enabled routing:

- **Alex** — Gemini as optional research / second-opinion path.
- **Maya** — Gemini as optional creative/ad-analysis reasoning; Meta Ads connectivity remains a separate connector concern.
- **Paijo** — local Qwen/DeepSeek for low-cost analysis where quality is sufficient.
- **Subagjo / Bimo** — Codex only for explicit hard engineering tasks; local Qwen for trivial transforms.
- **Siti** — independent verification; may compare outputs but should not blindly trust any provider.

## Safety boundary

Do not roll this out as "every employee gets every provider."

Keep provider credentials profile-scoped, connector permissions role-scoped, external writes approval-gated, and specialist invocation explicit until evidence supports broader automation.
