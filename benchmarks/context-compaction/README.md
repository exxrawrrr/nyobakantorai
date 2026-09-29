# Fikri context-compaction regression benchmark

This directory tests the **deterministic context guard**, not live-model intelligence.

Run:

```bash
node benchmarks/context-compaction/run.mjs
node benchmarks/context-compaction/run.mjs --check
```

Metrics:

- approximate original token count;
- L0 dispatch-card token count;
- reduction ratio;
- protected-atom recall;
- required-fact recall.

The fixtures are synthetic and intentionally contain duplicated low-signal prose around exact constraints.

A passing result proves that the deterministic guard can shrink these fixtures while preserving the tested exact atoms and required facts.

It does **not** prove:

- live Fikri/model quality;
- semantic equivalence for arbitrary prose;
- downstream task success on real work;
- LLMLingua quality;
- cross-harness compatibility.

Those remain separate evaluation work. The benchmark exists to prevent a basic regression where token reduction deletes exact constraints while still looking superficially successful.
