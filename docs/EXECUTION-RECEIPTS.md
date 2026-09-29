# Signed execution receipts

nyobakantorai separates four different claims:

```text
authorized
!=
executed
!=
signed by a trusted runtime key
!=
independently verified as correct
```

A signed execution receipt gives the project a tamper-evident record of what a trusted runtime claims it did. It does **not** replace independent verification.

## Receipt shape

The JSON schema is:

`schemas/execution-receipt.schema.json`

The implementation is:

`packages/execution-receipt/index.mjs`

A normalized payload records:

- receipt ID;
- task ID;
- employee ID;
- action;
- capability ID when applicable;
- risk class;
- autonomy mode;
- authorization decision + approval reference;
- start/finish timestamps;
- result state and summary;
- artifact/evidence references;
- runtime/provider identity;
- token usage;
- whether cost is known;
- amount/currency when cost is known;
- optional previous receipt SHA-256 for chaining.

Result states are:

```text
SUCCEEDED
FAILED
PARTIAL
BLOCKED
```

Unknown cost stays unknown. A receipt with `cost_known=false` may not smuggle a cost amount or currency.

## Signing

Receipts use Ed25519.

The signed envelope contains:

```text
schema
alg = Ed25519
key_id
payload
payload_sha256
signature_base64
```

The canonical receipt reference is:

```text
receipt:sha256:<payload_sha256>
```

The signature covers canonical JSON for the exact payload. Changing a task ID, amount, result, evidence reference, or any other signed field causes verification failure.

## Keys

Private signing keys are runtime secrets and must not be committed to the repository.

The library includes `generateReceiptKeyPair()` for tests/development. Production runtimes should use their own managed Ed25519 key material and expose only the public key to the verifier trust store.

`key_id` supports explicit trust and rotation. A valid signature from an unknown key ID is still rejected.

## High-impact actions

For these risk classes:

- `EXTERNAL_WRITE`
- `PAID_ACTION`
- `ACCOUNT_CHANGE`
- `DESTRUCTIVE`

an authorized receipt must include an approval reference.

A non-`BLOCKED` execution result must have `authorization.allowed=true`.

This prevents a signed object from normalizing an unauthorized execution into a successful-looking receipt.

## Evidence verification

`packages/evidence-verifier/` can opt into cryptographic receipt enforcement with:

```text
expected.require_signed_execution_receipt = true
expected.receipt_public_keys = { <key_id>: <public-key-pem> }
```

It can additionally bind the receipt to:

- expected task ID;
- expected employee/assignee;
- expected capability ID;
- allowed result states.

When signed receipt enforcement is enabled, the verified `receipt:sha256:...` reference must also appear in the evidence packet references.

The verifier rejects:

- missing signed receipt;
- tampered payload;
- invalid signature;
- unknown key;
- wrong task/worker/capability;
- wrong result state;
- stale receipts when a freshness policy is active;
- a receipt reference that has already been consumed;
- duplicate/replayed receipts inside one evidence packet;
- runtime/provider identities outside the explicit allowlist;
- a valid receipt that is not referenced by the evidence packet.

### Freshness, replay, and runtime trust

Cryptographic verification is intentionally not treated as replay protection.

Replay is state-dependent. The receipt verifier accepts `consumedReceiptRefs`, while the evidence layer accepts `expected.consumed_receipt_refs`. Callers should populate that state from their durable receipt/event history before verification. The verifier also catches duplicate signed receipts within the same evidence packet.

Receipt freshness can be bounded with `maxReceiptAgeMs` or `expected.max_execution_receipt_age_ms`. A newer evidence observation does not make an old execution receipt fresh.

A trusted signing key also does not grant arbitrary runtime identity. Callers may constrain receipt payloads with:

- `allowedRuntimeProviders` / `expected.allowed_receipt_runtime_providers`;
- `allowedRuntimeRefPrefixes` / `expected.allowed_receipt_runtime_ref_prefixes`.

These checks bind a trusted signature to the runtime/provider scope expected for the task.

## Task registry binding

The local task registry stores only the receipt reference, not the private key or the full signed envelope.

`attachExecutionReceipt(...)` accepts only:

```text
receipt:sha256:<64 lowercase hex chars>
```

and records an append-only `EXECUTION_RECEIPT_ATTACHED` event.

A registry import containing a receipt ref without its attachment event fails validation.

Cryptographic verification stays in the evidence layer. The registry intentionally does not become a trust store.

## Chain support

`previous_receipt_sha256` can link a later receipt to a previous receipt.

This is useful for multi-step execution histories, but chaining does not by itself prove that each external action occurred correctly. Each receipt still needs a trusted signer and relevant evidence.

## Tests

Run:

```bash
npm run test:receipts
npm run test:verifier
npm run verify
```

Tests cover:

- stable canonical JSON;
- Ed25519 sign/verify;
- tamper detection;
- unknown-key rejection;
- task/worker/capability binding;
- result-state binding;
- stale-receipt rejection;
- consumed/duplicate receipt replay rejection;
- runtime/provider allowlist enforcement;
- high-impact approval reference;
- normalized cost rules;
- secret-like content rejection;
- receipt-chain hash format;
- evidence-verifier integration;
- append-only task-registry attachment.

The deterministic adversarial benchmark also contains a signed-receipt matrix covering valid, tampered, replayed, wrong task, wrong employee, wrong capability, stale, and unauthorized-runtime cases. Its release target remains zero false successes.
