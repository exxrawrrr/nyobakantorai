# Deterministic local memory-isolation benchmark

This benchmark exercises the repository's own M1/M2/M3 visibility boundary.

It checks negative contamination cases:

1. Maya private memory is not visible to Gugun.
2. Gugun private memory is not visible to Maya.
3. M3 memory is not visible without an explicitly authorized shared scope.
4. Authorized M3 visibility does not expose the original private source memory.
5. A forged M3 record without required human review fails closed.

Run:

```bash
node benchmarks/memory-isolation/run.mjs
node benchmarks/memory-isolation/run.mjs --check
```

Target:

```text
false_successes = 0
```

This is a deterministic local policy benchmark. It does not prove Cognee, Hermes memory, or any other live memory provider is isolated. Provider status remains `NOT_RUN / UNPROVEN` until a real evidence-backed provider run exists.
