# TEMP — Next Modular Workforce Implementation Plan

> Companion to `docs/_TEMP_NEXT_MODULAR_WORKFORCE_PRD.md`.  
> This is an execution checklist, not a claim that the work is already implemented.  
> Delete after completion and migration into permanent docs/issues.

## Guiding rule

Do not mix broad workforce enrichment, selective packaging, live external write adapters, UI redesign, and benchmark work into one uncontrolled PR.

Ship in reviewable slices.

---

# Phase 0 — Baseline and branch hygiene

- [ ] Confirm `main` includes merged PR #9.
- [ ] Treat open PR #8 as separate/stale work; do not accidentally merge its overlapping changes into this branch.
- [ ] Run current `npm run ready` before implementation.
- [ ] Record baseline package/version/workforce hashes.
- [ ] Add no runtime feature in the PRD-only commit.

Exit:
- baseline green;
- no uncommitted generated drift.

---

# Phase 1 — Capability schema

Goal: make "skill/tool/MCP/plugin/workflow/memory/hook/adapter/policy" machine-readable.

Planned files:

```text
config/capability-catalog.json
schemas/capability.schema.json
scripts/validate-capability-catalog.mjs
```

Tasks:

- [ ] Define capability `kind`.
- [ ] Define `source_id`.
- [ ] Define `usage_mode`.
- [ ] Define `default_state`.
- [ ] Define risk classes.
- [ ] Define allowed platforms.
- [ ] Define install/verification metadata.
- [ ] Add source-ID validation.
- [ ] Add duplicate/contradictory capability detection.
- [ ] Keep existing `config/capabilities.json` compatibility or migrate deliberately.

Tests:
- [ ] unknown source fails;
- [ ] unsafe external capability cannot default to connected/write;
- [ ] duplicate IDs fail;
- [ ] missing verification method on executable capability fails.

---

# Phase 2 — Typed employee contracts

Goal: employee identity becomes operationally precise.

Extend canonical employee model with:

- `inputs`;
- `outputs`;
- `allowed_capabilities`;
- `forbidden_capabilities`;
- `evidence_requirements`;
- `failure_policy`;
- `verification_method`;
- optional `cost_ceiling`;
- optional `sla`.

Tasks:

- [ ] Add schema.
- [ ] Backfill all 16.
- [ ] Keep personality fields.
- [ ] Add role overlap rationale where needed.
- [ ] Regenerate profiles.
- [ ] Add drift test.

Exit:
- each worker can be understood without reading personality copy.

---

# Phase 3 — Employee pack generator

Goal: export any worker independently.

Create:

`scripts/employee-pack.mjs`

Supported:

```bash
node scripts/employee-pack.mjs --employee siti
node scripts/employee-pack.mjs --employees praroro,siti
node scripts/employee-pack.mjs --all
node scripts/employee-pack.mjs --check
```

Tasks:

- [ ] Read canonical employee registry.
- [ ] Resolve required skills.
- [ ] Resolve source/provenance closure.
- [ ] Generate pack manifest.
- [ ] Copy generated Hermes profile.
- [ ] Include only required skill directories.
- [ ] Include optional integration metadata without installing it.
- [ ] Emit license/provenance report.
- [ ] Emit SHA-256 checksums.
- [ ] Make output deterministic.

Tests:
- [ ] Praroro-only export.
- [ ] Siti-only export.
- [ ] arbitrary two-worker export.
- [ ] all-worker export.
- [ ] no orphan skill.
- [ ] no unrelated worker files.
- [ ] deterministic repeated build.

---

# Phase 4 — Selective installer

Goal: user installs 1..16 employees.

Update:

- `install.sh`
- `install.ps1`
- `scripts/hermes-bootstrap.mjs`

Behavior:

- [ ] `--employees all` retains current behavior.
- [ ] subset installation supported.
- [ ] unknown employee fails with valid IDs.
- [ ] install order deterministic.
- [ ] existing selected profiles upgraded safely.
- [ ] unselected existing profiles untouched.
- [ ] user-owned auth/config/memory preserved.
- [ ] optional plugins remain opt-in.

Add preset support later in this phase:

- [ ] leadership
- [ ] engineering
- [ ] growth
- [ ] research
- [ ] operations
- [ ] creative-community
- [ ] full

---

# Phase 5 — Portable Agent Skills compatibility

Goal: keep Hermes-first runtime while reducing lock-in.

Tasks:

- [ ] Audit current `skills/hermes-custom/*` metadata against Agent Skills spec.
- [ ] Normalize skill names/descriptions where safe.
- [ ] Separate host-specific instructions into reference/adapters.
- [ ] Keep skill body concise.
- [ ] Move large references/examples into on-demand files.
- [ ] Add skill-lint CI.
- [ ] Add compatibility notes for Hermes / Copilot / Gemini CLI / Codex where actually tested.
- [ ] Do not claim portability for untested host behavior.

Evaluation:
- [ ] sample skills recognized by at least two compatible harnesses before marketing cross-harness support.

---

# Phase 6 — Research catalog expansion

Add reviewed candidates to provenance registry.

Priority candidates:

1. `agentskills/agentskills`
2. `github/awesome-copilot`
3. `google-gemini/gemini-cli`
4. `microsoft/LLMLingua`
5. `yamadashy/repomix`
6. `topoteretes/cognee-integrations`
7. `microsoft/playwright-mcp`
8. `browser-use/browser-use`
9. `GoogleChrome/lighthouse`
10. `pola-rs/polars`

For each:

- [ ] pin commit;
- [ ] verify license;
- [ ] identify exact files/concepts reviewed;
- [ ] decide usage mode;
- [ ] decide workers;
- [ ] security review;
- [ ] document install state;
- [ ] document whether code/text is copied or only referenced.

Do not bulk import community skills.

---

# Phase 7 — Role-by-role capability enrichment

## Praroro
- [ ] delegation contract;
- [ ] capability-aware routing;
- [ ] decision packet;
- [ ] dependency/blocked-state memory;
- [ ] compact handoff.

## Paijo
- [ ] stronger metric definition contract;
- [ ] scenario/sensitivity template;
- [ ] optional Polars analysis path;
- [ ] anomaly evidence format.

## Subagjo
- [ ] engineering plan/review workflow;
- [ ] MCP implementation checks;
- [ ] codebase context pack support;
- [ ] browser-test option;
- [ ] rollback evidence.

## Alex
- [ ] source-quality rubric;
- [ ] browser research workflow;
- [ ] contradiction/counterexample extraction;
- [ ] research packet for downstream workers.

## Sumiati
- [ ] creative brief variants;
- [ ] brand-claim provenance;
- [ ] channel adaptation;
- [ ] avoid loading engineering skills.

## Siti
- [ ] independent verifier contract;
- [ ] adversarial evidence checks;
- [ ] acceptance-criteria parser;
- [ ] browser verification read mode;
- [ ] source/claim mismatch detection.

## Maya
- [ ] Meta analysis contract;
- [ ] propose-vs-execute separation;
- [ ] post-change evidence;
- [ ] provider adapter remains optional/guarded.

## Gugun
- [ ] search-term/negative analysis;
- [ ] conversion truth checks;
- [ ] propose-vs-execute separation;
- [ ] post-change evidence.

## Ratri
- [ ] Lighthouse audit adapter;
- [ ] browser QA;
- [ ] SEO/CRO evidence packet;
- [ ] source-preserving page extraction.

## Bimo
- [ ] MCP capability registry;
- [ ] auth/scope checklist;
- [ ] idempotency/retry design;
- [ ] hook/policy patterns from Gemini extension research.

## Nara
- [ ] reproducible data transformation;
- [ ] experiment readout;
- [ ] optional Polars path;
- [ ] table/document ingestion.

## Dina
- [ ] meeting-to-actions;
- [ ] owner/deadline normalization;
- [ ] project brief compaction;
- [ ] connector actions remain explicit.

## Bambang
- [ ] automation ROI heuristic;
- [ ] batch/retry classification;
- [ ] "automation creates more work" postmortem memory;
- [ ] no unnecessary external platform dependency.

## Fikri
- [ ] prompt compiler;
- [ ] MarkItDown path;
- [ ] Docling fallback/evaluation;
- [ ] Repomix codebase pack;
- [ ] LLMLingua experimental mode;
- [ ] L0/L1/L2 output;
- [ ] source trace map;
- [ ] token/fidelity metrics.

## Tari
- [ ] stale commitment detector;
- [ ] closure checklist;
- [ ] escalation threshold;
- [ ] evidence-required completion.

## Caca
- [ ] social listening research;
- [ ] outreach brief;
- [ ] brand-safety checks;
- [ ] posting remains connector+approval gated.

---

# Phase 8 — Memory and learning implementation

Goal: every worker can improve without hidden self-modification.

Tasks:

- [ ] formalize M0/M1/M2/M3/M4 layers;
- [ ] create local learning-event schema;
- [ ] create skill-candidate schema;
- [ ] enforce profile ID on memories;
- [ ] explicit shared promotion action;
- [ ] secret/personal-data guard on shared promotion;
- [ ] record source/evidence for promoted lessons;
- [ ] canonical skill edits only via repository change;
- [ ] test deletion/export.

Optional Cognee evaluation:
- [ ] local setup;
- [ ] Hermes integration;
- [ ] per-profile isolation test;
- [ ] retrieval quality test;
- [ ] delete/export test;
- [ ] performance/cost;
- [ ] reject adoption if profile isolation is weak.

---

# Phase 9 — Fikri context pipeline

Implement a deterministic pipeline before experimenting with learned/token-level compression.

Order:

```text
raw input
-> parse
-> source inventory
-> exact constraints
-> duplicate removal
-> Markdown normalization
-> L2 canonical notes
-> L1 working brief
-> L0 dispatch card
-> optional semantic compression experiment
```

Tasks:

- [ ] document/file type detection;
- [ ] MarkItDown integration contract;
- [ ] source anchors;
- [ ] constraint extraction;
- [ ] exact-number preservation;
- [ ] acceptance criteria extraction;
- [ ] token estimates;
- [ ] original-vs-compiled diff;
- [ ] "must not compress" sections;
- [ ] optional LLMLingua sandbox mode.

Hard rule:
- never destroy the original source;
- never use lossy compression as the only evidence artifact.

---

# Phase 10 — Browser capability evaluation

Compare at least:

- Playwright MCP;
- Browser Use;
- current browser mechanisms available to the runtime.

Benchmark:

- navigation;
- structured extraction;
- multi-tab research;
- form interaction;
- download;
- screenshot/evidence;
- timeout recovery;
- auth profile handling;
- destructive/write safety.

Do not select based on demo aesthetics.

Select per worker and task type.

---

# Phase 11 — Evaluations

## A. Packaging
- [ ] clean install one employee;
- [ ] clean install two;
- [ ] full;
- [ ] upgrade;
- [ ] uninstall;
- [ ] Windows + Linux.

## B. Memory
- [ ] cross-profile leakage;
- [ ] false retrieval;
- [ ] stale memory;
- [ ] deletion;
- [ ] skill-candidate promotion.

## C. Context
- [ ] token reduction;
- [ ] exact constraint retention;
- [ ] numeric fidelity;
- [ ] source fidelity;
- [ ] downstream task success.

## D. Verifier
Inject:
- [ ] wrong number;
- [ ] fake citation;
- [ ] stale data;
- [ ] wrong file;
- [ ] partial completion;
- [ ] fabricated evidence;
- [ ] unauthorized action;
- [ ] prompt injection.

## E. Failure recovery
- [ ] process crash;
- [ ] provider unavailable;
- [ ] tool timeout;
- [ ] malformed output;
- [ ] partial result;
- [ ] delayed approval;
- [ ] verifier rejection after completion.

## F. Real tasks
Start with 20 genuine tasks before scaling to 100+.

Record:
- success;
- evidence completeness;
- human intervention;
- retries;
- cost;
- duration;
- verification outcome.

---

# Phase 12 — Documentation and release

Permanent docs to update after implementation:

- [ ] README capability matrix.
- [ ] ROADMAP.
- [ ] EMPLOYEE-ARCHITECTURE.
- [ ] HERMES-FIRST-SETUP.
- [ ] V0.3/next upgrade documentation.
- [ ] UPSTREAM-SOURCE-CATALOG.
- [ ] MARKDOWN-KNOWLEDGE.
- [ ] new EMPLOYEE-PACKS guide.
- [ ] new MEMORY-LEARNING model.
- [ ] new EVALUATION methodology.

Release assets:
- [ ] 16 employee ZIPs;
- [ ] presets/full ZIP;
- [ ] checksums;
- [ ] source/provenance manifest.

---

# PR slicing recommendation

Recommended PRs:

1. **Capability schema + typed employee contracts**
2. **Pack generator + tests**
3. **Selective installer + presets**
4. **Agent Skills compatibility/lint**
5. **Source catalog expansion**
6. **Fikri context pipeline**
7. **Memory/learning layer hardening**
8. **Role-specific optional tools**
9. **Evaluation harness**
10. **Release/docs cleanup**

Do not put all ten into one mega-PR.

---

# Definition of done

The work is not done because files exist.

It is done when:

- a clean machine can install one selected worker;
- a selected subset does not pull unrelated employees;
- provenance is machine-readable;
- memory remains isolated;
- Fikri reduces context without losing critical instructions;
- optional integrations remain honest about state;
- at least one real workflow per major department succeeds end-to-end with evidence;
- evaluation data is published;
- temporary PRD/workplan files are removed and permanent docs reflect reality.
