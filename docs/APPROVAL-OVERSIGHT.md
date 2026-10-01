# Approval Oversight — Anomaly-First Contract

v0.5 approval oversight is designed to reduce full-output rereads without allowing the producing agent to certify itself as safe.

## Trust rule

The approval summary is computed from structured state/signals only. Trusted signal sources are:

- `REGISTRY`
- `POLICY_ENGINE`
- `VERIFIER`
- `RUNTIME_ADAPTER`
- `HUMAN_REVIEW`

Unknown, malformed, or agent-authored safety signals are ignored. Ignoring them is itself surfaced as an anomaly. Task prose may describe the requested action, but prose is never used to lower risk, clear a failed check, or mark work verified.

The summary always preserves this boundary:

`structured evidence summary != permission != execution != verification`

## Summary fields

The contract exposes:

- task/risk and approval state;
- requested action;
- material changes and changed resources;
- capabilities used and capability escalations;
- policy violations;
- failed checks and passed-check count;
- missing evidence;
- anomalies and unusual output;
- verification state;
- trusted confidence/status when supplied;
- exact reason human judgment is required.

`safe_to_auto_approve` is always false. This module assists owner judgment; it does not replace the owner approval gate.

## UI priority

Approval cards and mission detail show risky structured facts before descriptive prose. The priority order is:

1. anomalies;
2. missing evidence;
3. failed checks;
4. policy violations;
5. capability escalations;
6. material changes;
7. passed checks.

Zero-state facts remain visible where useful, including “no capability escalation”, so absence of an escalation is not confused with an unmeasured state.

## Deterministic evidence fixtures

`office/tests/fixtures/approval-summary.json` covers:

- routine low-risk state;
- missing evidence;
- capability escalation;
- material file/resource changes;
- policy violation;
- mixed pass/fail state.

The test suite also proves that agent-authored “all clear” signals cannot become trusted PASS/VERIFIED state.

## Current data boundary

The local office can derive structured signals from registry state, approval events, runtime reconciliation/quarantine state, attachments/resource metadata, and verification evidence references. Provider/policy/verifier integrations may supply richer structured signals later, but they must enter through the trusted signal boundary rather than free-form agent prose.
