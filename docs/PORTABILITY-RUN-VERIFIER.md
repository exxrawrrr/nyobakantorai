# Independent Portability Run Verifier

Status: v0.5 release-blocker work — independent verification for canonical live Hermes/Codex run records.

Implementation:

`reference-verifier/python/portability_run_verifier.py`

Tests:

`reference-verifier/python/test_portability_run_verifier.py`

The implementation is independent from the JavaScript portability comparator: it does not import JavaScript, invoke the comparator, or consume a JavaScript verdict.

It independently checks the canonical manifest/component hashes, LIVE_RUNTIME_EVIDENCE class, runtime/adapter identity, successful bounded execution and cleanup, evidence bindings, exact Git commit, workspace/prohibited-action/runtime-action safety, protected atoms including explicitly enumerated equivalent evidence paths, residual incomplete/not-VERIFIED truth, canonical live-capture qualification, and a second public-safety scan.

Run:

```bash
npm run portability:verify-run -- <run.json> --out <verification.json> --verified-run-out <verified-run.json>
```

A PASS report produces an evidence reference as SHA-256 over the independent report core. The verified-run copy receives that PASS reference for the JavaScript comparator. A FAIL report writes FAIL metadata and exits nonzero.

A pre-existing `external_verification: PASS` inside the input run is ignored as authority. The Python implementation recomputes its own verdict.

Claim boundary: PASS verifies only the bounded canonical run record against the checked-in reference contract. It does not prove global runtime parity or external-world correctness.
