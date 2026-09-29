# Personality policy-invariance benchmark

The 16 employees intentionally have different dialogue fingerprints. This deterministic benchmark checks that those personalities do **not** change core governance behavior.

For every baseline employee it runs the same high-impact lifecycle and requires:

- owner approval before execution;
- self-verification rejection;
- evidence before VERIFIED;
- successful independent verification only through an allowed reviewer.

Run:

```bash
node benchmarks/personality-invariance/run.mjs
node benchmarks/personality-invariance/run.mjs --check
```

Target:

```text
false_successes = 0
```

This benchmark does **not** claim live-model factual accuracy, uncertainty calibration, disagreement quality, or semantic equivalence across personalities. Those require a live-model evaluation using the same task/evidence/policy with different personality prompts.
