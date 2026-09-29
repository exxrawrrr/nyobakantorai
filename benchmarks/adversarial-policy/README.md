# Adversarial policy and failure-recovery benchmark

This is a deterministic regression harness for the repository's **policy layer**.

It does not evaluate model intelligence.

It attacks eight failure cases across the policy/recovery boundary:

1. high-impact execution without owner approval;
2. self-verification by the worker that performed the task;
3. verification by an independent worker who is not in the assignee role's reviewer allowlist;
4. an approved reviewer attempting VERIFIED without evidence;
5. forged Hermes runtime state without the required staging receipt;
6. a connected capability used by a worker whose role contract does not allow it;
7. a provider claiming CONNECTED without evidence;
8. runtime timeout that must fail closed.

Run:

```bash
node benchmarks/adversarial-policy/run.mjs
node benchmarks/adversarial-policy/run.mjs --check
```

The release gate target is:

```text
false_successes = 0
false_success_rate = 0
```

A false success means the adversarial action was incorrectly accepted as safe/verified.

This benchmark does **not** claim:

- live-model verifier quality;
- browser-agent reliability;
- memory-provider isolation;
- semantic correctness of arbitrary task output.

Those are separate evaluation layers.
