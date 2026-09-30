# Fikri live context-compaction evaluation

This directory records **live-model** evaluation evidence for Fikri's context/prompt compiler.

The run uses the existing five controlled fixtures from `benchmarks/context-compaction/fixtures.json`. Each fixture is compiled in a live model session, then compared through separate downstream executions from the original and compiled contexts. A separate blind reviewer receives the authoritative source plus responses labeled only A/B.

## Latest controlled run

- date: 2026-09-29
- model: GPT-5.6 Sol via Codex CLI 0.154.0
- compiler skill: `nyoba-context-prompt-compiler` 1.1.1
- cases: 5
- average estimated token reduction: **41.10%**
- worst case reduction: **32.56%**
- strict protected-atom recall: **100%**
- compiled required-fact recall: **100%**
- blind compiled downstream pass: **5/5**
- compiled downstream critical losses: **0**

The first live attempt failed: the compiler expanded context by about 43.5% and paraphrased exact constraints. That failure drove the 1.1.x hardening: explicit constraint-line fidelity, no invented empty fields, a real reduction target, corrected Rupiah atom parsing, and preservation of verification/evidence semantics.

## Claim boundary

This proves a controlled live-model regression set, not broad real-world quality. The fixtures remain synthetic. The separate >=20 real-task baseline is still required, and this run does not establish Hermes/Gemini/Copilot behavioral parity.

Run the deterministic evidence validator with:

```bash
node benchmarks/fikri-live/validate.mjs --check
```
