# Differential / Adversarial Verifier Corpus

Status: **v0.5 Chat 12–13 — shared cross-implementation verifier + signing-key lifecycle gate**

This benchmark is the first release gate that feeds the **same static signed-receipt fixtures** to both verifier implementations:

- JavaScript production verifier;
- independent Python reference verifier.

Corpus:

```text
benchmarks/verifier-differential/corpus.json
```

Run:

```bash
npm run test:verifier-differential
```

## Static fixture rule

The corpus is committed as concrete JSON packets. Cases are not independently regenerated or patched by each verifier at test time.

Signatures were generated once with an ephemeral Ed25519 private key. The private key is not stored. The corpus contains only the public key, payloads, signatures, policies, evidence references, and expected decisions.

Both evaluators compute SHA-256 over the exact same corpus bytes. A corpus-hash disagreement fails the gate before verdict comparison can be trusted.

## Corpus cases

The v2 corpus contains 24 cases:

1. valid trusted receipt;
2. payload modified after signing;
3. modified signature;
4. unknown signing key;
5. stale receipt;
6. future receipt;
7. task binding mismatch;
8. worker binding mismatch;
9. capability binding mismatch;
10. result-state mismatch;
11. runtime provider/reference mismatch;
12. previously consumed receipt replay;
13. duplicate receipt replay inside one packet;
14. valid receipt missing its evidence reference;
15. ACTIVE key valid after activation;
16. ACTIVE key used before `valid_from`;
17. RETIRED key historical receipt inside validity window;
18. RETIRED key receipt after `valid_until`;
19. REVOKED `REJECT_ALL` historical receipt;
20. REVOKED `ALLOW_PRE_COMPROMISE` receipt before cutoff;
21. REVOKED `ALLOW_PRE_COMPROMISE` receipt at/after cutoff;
22. key runtime-scope mismatch;
23. registry unknown key despite legacy public-key presence;
24. invalid registry with duplicate `key_id`.

Corpus v2 SHA-256:

```text
0bcdc49bf70608d7b8bd9dac86f19819a04d27e72c2462bcd65c71fecf3e577e
```

## Compared surface

For every case, CI compares:

- accept/reject;
- packet-level reason-code set;
- ordered per-receipt reason sets;
- corpus SHA-256;
- the result against the expected decision embedded in the corpus.

A JavaScript/Python disagreement fails CI.

A situation where both implementations agree with each other but disagree with the corpus's expected decision also fails CI. This avoids treating shared wrong behavior as success.

## Runner separation

`node-runner.mjs` uses the JavaScript execution-receipt/evidence-verifier implementation.

`reference-verifier/python/differential_runner.py` imports only the independent Python verifier.

`run.mjs` is an orchestrator. It does not compute receipt validity itself; it executes the Python evaluator, evaluates the Node side, normalizes the outputs, and compares them.

The Python verifier still does not invoke Node or consume a Node verdict.

## Claim boundary

Passing this gate supports:

> JavaScript and Python independently agree on accept/reject and tested reason semantics for the shared v2 signed-receipt/evidence + signing-key lifecycle corpus.

It does not prove:

- correctness for every possible JSON/crypto edge case;
- correctness of external work described by a receipt;
- every possible signer-key lifecycle/compromise scenario beyond the tested registry policies;
- live runtime portability.

Those remain separate gates.
