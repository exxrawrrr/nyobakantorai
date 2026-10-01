# Independent Python Reference Verifier

Status: **v0.5 Chat 11 — implementation-independent receipt verification path**

The Python reference verifier exists to prove that receipt/evidence trust decisions are not only a second call path through the same JavaScript implementation.

Implementation:

```text
reference-verifier/python/verifier.py
```

Tests:

```text
reference-verifier/python/test_verifier.py
```

Run directly:

```bash
npm run test:reference-verifier-python
```

The suite is also part of `npm run test:python` and therefore runs on the repository's Python 3.10 minimum-version job and Python 3.12 cross-platform jobs.

## Independence boundary

The verifier does **not**:

- import the JavaScript execution-receipt implementation;
- import the JavaScript evidence verifier;
- invoke a JavaScript runtime;
- shell out to a JavaScript verifier;
- consume a precomputed JavaScript verdict;
- reuse generated verdict-producing bindings.

It does consume the public receipt contract and implements the decision logic independently in Python.

Python `cryptography` is used only as the Ed25519 cryptographic primitive. Hashing, canonicalization, bindings, freshness, replay handling, runtime scoping, evidence-reference checks, and verdict construction are implemented in the reference verifier itself.

## Verification scope

The Chat 11 verifier independently checks:

- canonical receipt envelope shape;
- payload canonical JSON and SHA-256;
- Ed25519 signature;
- trusted `key_id`;
- payload structural/semantic validity;
- task binding;
- worker/employee binding;
- capability binding;
- allowed result states;
- future timestamp rejection;
- receipt freshness;
- consumed receipt replay;
- duplicate receipt replay inside one packet;
- runtime provider allowlist;
- runtime reference-prefix allowlist;
- required receipt reference presence in the evidence packet.

The packet-level API mirrors only the signed-receipt trust surface needed for cross-implementation differential proof. It intentionally does not duplicate unrelated report-fact, prompt-injection, artifact, or approval UI logic from the broader JavaScript evidence verifier.

## Canonical bytes

The signature is verified over canonical JSON bytes for the payload, not over the payload hash.

For the current receipt domain, canonical JSON uses:

- recursively sorted object keys;
- UTF-8 JSON without insignificant whitespace;
- no ASCII escaping for ordinary Unicode text;
- finite JSON numbers only.

The SHA-256 in the receipt envelope must match those exact canonical payload bytes before signature trust can succeed.

## Packet replay behavior

Packet verification starts with any caller-supplied consumed receipt references.

After each signed receipt is checked, its canonical receipt reference is added to the packet-local consumed set. Therefore a duplicate occurrence of the same receipt in the same packet is rejected as replay even if its signature is otherwise valid.

## Claim boundary

Passing Chat 11 supports only this claim:

> nyobakantorai has a second, independently implemented verifier for the tested receipt/evidence trust surface.

It does **not** yet prove that JavaScript and Python agree on every adversarial fixture. That is the differential-corpus gate in the next workstream.

It also does not prove that the external work described by a valid signed receipt actually happened correctly.

## Signing-key lifecycle extension

The Python reference verifier independently implements public trust-registry validation and receipt trust resolution for ACTIVE, RETIRED, and REVOKED keys, including validity windows, runtime scope, `REJECT_ALL` revocation, and `ALLOW_PRE_COMPROMISE` cutoff behavior.

It does not import the JavaScript trust-registry implementation.


## Portability-run verifier extension

v0.5 also includes a separate Python verifier for canonical live portability run records: `reference-verifier/python/portability_run_verifier.py`.

It is independent from the JavaScript portability comparator and ignores self-attested verification state. See `docs/PORTABILITY-RUN-VERIFIER.md`.

This is a second verification domain alongside signed receipt verification; neither domain proves external-world correctness.
