# Signing-Key Lifecycle and Public Trust Registry

Status: **v0.5 Chat 13 — executable trust lifecycle**

The signed execution receipt proves that a holder of an accepted private signing key signed the canonical receipt payload. It does **not** prove that the external work described by the receipt was correct.

The repository now separates:

- private signing-key ownership;
- public trust anchors;
- lifecycle status;
- receipt-time validity;
- runtime scope;
- rotation;
- revocation;
- compromise response.

Canonical public registry:

```text
config/receipt-trust-registry.json
```

Schema:

```text
schemas/receipt-trust-registry.schema.json
```

The canonical registry currently contains **zero production trust anchors**. This is deliberate and truthful. Test fixtures generate ephemeral private keys at runtime; private key material is never committed.

## Threat model

### Signer identity

Every trusted key entry names the signer identity that is allowed to produce receipts with that key.

### Key owner

Every trusted key entry names the human/team/system boundary responsible for the key.

### Generation boundary

Private keys must be generated outside the repository on the signer-controlled runtime or approved key-management boundary.

### Public trust anchor

Only the public Ed25519 key is allowed in the registry.

A registry containing private-key material is invalid.

### Storage expectation

Private keys remain in signer-owned secret storage. The repository must not become a secret store.

### Runtime scope

A key is trusted only for the declared:

- `runtime_provider_scope`;
- `runtime_ref_prefixes`.

A cryptographically correct signature from the wrong runtime scope is rejected.

## Lifecycle states

### ACTIVE

An ACTIVE key is accepted only when the receipt `finished_at` is:

- on or after `valid_from`;
- on or before `valid_until`, when one exists;
- inside the declared runtime scope.

ACTIVE uses:

```text
historical_policy = ALLOW_WITHIN_VALIDITY
```

### RETIRED

RETIRED means:

> stop using this key for new signatures, but preserve historical verification for receipts that were inside its explicit validity window.

A RETIRED key **must** have `valid_until`.

A receipt after `valid_until` fails with `KEY_EXPIRED`.

This allows key rotation without invalidating legitimate historical receipts.

### REVOKED

REVOKED is stronger than RETIRED.

Two explicit historical policies exist.

#### REJECT_ALL

```text
historical_policy = REJECT_ALL
```

Every receipt under that key is rejected with `KEY_REVOKED`, including receipts dated before `revoked_at`.

Use this when the compromise window cannot be bounded confidently.

#### ALLOW_PRE_COMPROMISE

```text
historical_policy = ALLOW_PRE_COMPROMISE
compromise_cutoff = <timestamp>
```

Only receipts whose `finished_at` is strictly **before** `compromise_cutoff` may remain trusted.

Receipts at or after the cutoff fail with:

```text
KEY_COMPROMISED_AFTER_CUTOFF
```

The cutoff must not be later than `revoked_at`.

## Important timestamp limitation

The receipt's `finished_at` is part of signed payload data, but it is not by itself a trusted external timestamp.

Therefore `ALLOW_PRE_COMPROMISE` is appropriate only when maintainers have independent operational evidence supporting the cutoff and accept the residual risk of a compromised signer backdating a receipt.

When that confidence does not exist, use `REJECT_ALL`.

## Rotation

Rotation must be explicit.

Typical sequence:

1. generate a new private key outside the repository;
2. add its public key as ACTIVE with a future/current `valid_from`;
3. keep the old key valid during a documented overlap window;
4. move the old key to RETIRED;
5. set old-key `valid_until` to the end of the overlap;
6. stop the signer from using the old private key;
7. verify both historical-old and new-key receipts with tests.

The helper `analyzeRotationOverlap()` proves that the two validity windows actually overlap.

No implicit grace period exists.

## Compromise response

For a suspected or confirmed signer-key compromise:

1. stop/disable the signer from using the key;
2. identify the affected `key_id`;
3. determine the earliest defensible compromise time;
4. update the public trust registry:
   - set `status = REVOKED`;
   - set `revoked_at`;
   - set `revocation_reason`;
5. choose one explicit historical policy:
   - `REJECT_ALL` when the compromise interval is uncertain;
   - `ALLOW_PRE_COMPROMISE` only when a defensible cutoff exists;
6. if using `ALLOW_PRE_COMPROMISE`, set `compromise_cutoff`;
7. generate a replacement key outside the repository;
8. add the replacement public key as ACTIVE with explicit runtime scope;
9. rerun trust-registry tests and differential verifier tests;
10. review previously accepted receipts signed by the revoked key according to the selected policy;
11. publish/ship the registry update through the normal reviewed release path.

Do not delete the revoked public key from the registry merely to hide history. Keeping its public metadata allows deterministic rejection and auditability.

## Registry fields

Each key records:

```text
key_id
public_key_pem
status
signer_identity
key_owner
generation_boundary
storage_expectation
valid_from
valid_until
runtime_provider_scope
runtime_ref_prefixes
revoked_at
compromise_cutoff
revocation_reason
historical_policy
```

## Verification precedence

When a receipt trust registry is provided, it is authoritative over the legacy `receipt_public_keys` / `publicKeys` map.

A caller cannot bypass a RETIRED/REVOKED/runtime-scoped registry entry merely by supplying the same public key through the legacy map.

Legacy public-key maps remain supported only for backward compatibility where no trust registry is supplied.

## Executable proof

Chat 13 tests cover:

- public-only registry validation;
- private-key rejection;
- ACTIVE validity;
- activation boundary;
- RETIRED historical verification;
- expired RETIRED receipt rejection;
- explicit rotation overlap;
- REVOKED `REJECT_ALL`;
- REVOKED `ALLOW_PRE_COMPROMISE`;
- runtime provider/ref scope;
- unknown keys;
- invalid lifecycle combinations;
- cryptographically valid signatures rejected by lifecycle policy;
- registry precedence over the legacy public-key map.

The shared JavaScript/Python differential corpus is also extended with lifecycle cases so both verifier implementations must agree on the same registry semantics.

## Claim boundary

Passing these tests supports:

> signing-key trust, lifecycle, rotation, runtime scope, revocation, and the tested compromise policies are machine-enforced for the receipt verifier contract.

It does not prove:

- secure private-key storage on every deployment;
- a trustworthy external timestamp for `finished_at`;
- correctness of the external action described by a signed receipt;
- automatic key rotation or revocation distribution to every external deployment.
