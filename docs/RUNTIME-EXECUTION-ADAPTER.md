# Runtime Execution Adapter Contract

Status: **v1 contract — Chat 3 / v0.5**

The execution adapter is deliberately separate from the read-only Runtime Adapter SDK in `packages/runtime-adapter/`.

The read-only SDK remains read-only. It still rejects `write`, `dispatch`, external-write, paid-action, account-change, and destructive capability. Chat 3 does not weaken that boundary.

The separately scoped execution contract lives in:

- `packages/runtime-execution-adapter/index.mjs`
- `packages/runtime-execution-adapter/conformance.mjs`
- `config/runtime-execution-policy.json`

## Why a separate contract exists

Portability proof needs a bounded way to ask a runtime to execute one reference task. Turning the snapshot SDK into a generic write/dispatch API would erase the distinction between observation and execution.

The v1 execution lifecycle is:

```text
prepare()
  -> executeBoundedTask()
  -> normalizeResult()
  -> collectEvidence()
  -> cleanup()
```

`cleanup()` is attempted even when an earlier phase fails or times out.

## Current v0.5 reference policy

The canonical Chat 3 policy is intentionally narrow:

- risk class: `READ_ONLY` only;
- declared execution capabilities only;
- temporary isolated workspace required;
- bounded timeout;
- bounded raw and normalized output;
- no install;
- no login;
- no account mutation;
- no external write;
- no paid action;
- no destructive action;
- no production repository mutation;
- bounded process capability, when declared, requires `shell:false` and an allowlisted executable.

This is an application-level contract, not an operating-system sandbox.

## Adapter identity

Every adapter must expose:

- adapter ID;
- adapter version;
- runtime provider;
- runtime reference;
- optional provider version;
- explicit declared execution capabilities;
- explicit prohibited side-effect declaration.

Unknown or undeclared capabilities fail closed.

## Task contract

The portable execution task contains:

- task ID;
- employee ID;
- exact objective;
- risk class;
- required runtime capabilities;
- required skills;
- prohibited actions;
- expected structured output contract.

Runtime-specific command syntax does not belong in the task.

## Normalized result

A normalized result must contain:

- `schema=1`;
- `state = SUCCEEDED | FAILED | PARTIAL | BLOCKED`;
- bounded summary;
- structured `output` object;
- bounded artifact references;
- bounded evidence references.

Malformed output, secret-like output, and output over the configured byte limit never become success.

## Evidence contract

A successful reference execution requires evidence for:

- raw-result artifact reference;
- normalized-result artifact reference;
- actual capabilities used;
- temporary-workspace-only mutation;
- no production repository mutation;
- prohibited-action check;
- no install/login/account mutation/external write;
- bounded evidence/artifact references.

If evidence contradicts the policy, the orchestrator fails closed even when the runtime reports `SUCCEEDED`.

## Timeout and cleanup truth

Timeout is a failure state, never success. The wrapper aborts the phase signal on timeout and still attempts cleanup.

An otherwise successful run is downgraded to `FAILED / CLEANUP_FAILED` when cleanup does not complete successfully.

## Conformance

`runRuntimeExecutionAdapterConformance()` provides a credential-free reference-case conformance entrypoint.

Package tests additionally prove negative cases for:

- undeclared/forbidden capability;
- unbounded shell declaration;
- timeout;
- malformed output;
- hidden install/login/account mutation/external write;
- production repository mutation;
- undeclared capability use;
- output overflow;
- cleanup failure;
- high-impact risk class.

Future Hermes and Codex execution adapters must pass this contract before live portability evidence is considered.

## Claim boundary

Chat 3 proves a bounded execution **contract and fail-closed wrapper**.

It does **not** prove:

- Hermes live execution;
- Codex live execution;
- Hermes/Codex behavioral parity;
- provider authentication correctness;
- OS/container isolation;
- general runtime portability.

Those require later reference-case and live-runtime evidence.
