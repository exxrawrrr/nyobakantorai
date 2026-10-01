---
name: nyoba-context-prompt-compiler
description: "Use when a user prompt, pasted brief, document set, or repository context is too noisy, repetitive, long, or ambiguous for efficient execution and must be converted into a source-traceable, token-efficient working packet without changing intent."
license: MIT
compatibility: "Hermes-first; follows the Agent Skills SKILL.md core format."
metadata:
  nyoba-version: "1.1.1"
  nyoba-author: "nyobakantorai"
  nyoba-platforms: "windows,linux,macos"
  nyoba-provenance-mode: "recreated"
  nyoba-source-ids: "agent-skills,markitdown,docling,repomix,llmlingua,ecc"
---

# Context & Prompt Compiler

## Primary owner
Fikri is the default owner. This is a **context engineering** procedure, not authority to reinterpret the user's intent.

## Goal
Turn messy input into the smallest sufficient execution context while preserving:
- the requested outcome;
- exact constraints and exclusions;
- numbers, dates, IDs, filenames, paths, URLs, names, and quoted requirements;
- approval scope and safety boundaries;
- source/provenance links;
- unresolved contradictions;
- acceptance criteria;
- output format.

Never make the prompt "cleaner" by deleting something that could change execution.

## Pipeline

### 1. Inventory the source
Identify every input:
- user message;
- pasted text;
- file/document;
- repository/code context;
- prior decision/checkpoint;
- external source.

Do not merge different sources into one voice before provenance is recorded.

### 2. Extract must-preserve atoms
Create an exact list of:
- objective;
- mandatory actions;
- prohibited actions;
- entities;
- numbers/thresholds;
- deadlines/time windows;
- file/path identifiers;
- requested tone/format;
- evidence/verification requirements;
- permissions/approval limits.

These atoms are protected from lossy compression.

### 2.1 Live compaction invariants

When producing a compact packet for another worker:

- copy the supplied objective sentence verbatim when one exists;
- copy explicit imperative constraint lines verbatim into the protected section;
- preserve exact numbers, dates, times, paths, URLs, IDs, amounts, percentages, quoted terms, and approval wording;
- do **not** invent an owner, requested action, risk class, approval authority, verification rule, or artifact that the source did not provide;
- omit empty fields instead of explaining that they are empty;
- do not include benchmark metadata, commentary about what was omitted, or editorial narration unless the downstream task needs it;
- keep provenance compact: source ID/path/URL is enough when detail remains available in L2.
- preserve source-stated verification, evidence-check, and acceptance requirements even when they are written as narrative prose rather than imperative lines; normalize them concisely, but do not drop them;
- before removing a prose sentence as background, ask whether it changes what must be verified, what evidence must be checked, or the condition for claiming success; if yes, keep that meaning in a compact `Verification:` or `Acceptance:` line.

The compact dispatch (L0 plus only necessary L1) should be strictly smaller than the original working source. Default target: at most 70% of the original estimated tokens. If that reduction cannot be achieved without losing protected information, return `NO_SAFE_REDUCTION` and keep the faithful source packet instead of expanding it.

### 3. Normalize
Remove:
- duplicated wording;
- navigation/boilerplate;
- repeated explanations;
- irrelevant formatting;
- already-resolved branches that no longer affect the task.

Do **not** remove caveats, exceptions, dissenting evidence, or negative requirements.

### 4. Build three context layers

**L0 — Dispatch Card**
Keep it small:
- objective;
- owner;
- inputs;
- must-preserve constraints;
- expected artifact;
- risk/approval;
- verification;
- next action.

**L1 — Working Brief**
Enough context to execute:
- background;
- decisions;
- relevant evidence;
- dependencies;
- source pointers;
- open contradictions/questions;
- acceptance criteria.

**L2 — Canonical Notes**
Detailed source-preserving Markdown. This is the durable layer that can reconstruct why L0/L1 say what they say.

Workers should receive L0 plus only the relevant parts of L1. Load L2 on demand.

### 5. Emit a machine-readable execution brief when useful

```json
{
  "objective": "",
  "must_preserve": [],
  "constraints": [],
  "inputs": [],
  "sources": [],
  "requested_actions": [],
  "prohibited_actions": [],
  "risk_classes": [],
  "expected_artifacts": [],
  "verification": [],
  "open_questions": [],
  "token_budget": {
    "original_estimate": null,
    "compiled_estimate": null,
    "target": null
  }
}
```

The machine brief supplements the original source; it never replaces it as evidence.

## Deterministic fidelity guard

When exact details matter, use the repository's local guard module before accepting a compressed/rewritten context packet:

`packages/context-guard/index.mjs`

It extracts machine-detectable protected atoms such as constraint lines, URLs, paths, dates/times, rupiah amounts, percentages, and explicit numeric forms. `verifyProtectedAtoms()` fails when any detected atom disappears from a compiled representation.

This is a **floor**, not full semantic verification: it catches exact-detail loss but cannot prove that a paraphrase preserved meaning. Human/model review still owns semantic fidelity.

## Tool strategy

Use the narrowest available path:

- plain text/Markdown -> normalize directly;
- MarkItDown -> common document-to-Markdown conversion when explicitly connected;
- Docling-style extraction -> complex tables/layout/structure;
- Repomix -> repository/codebase packing, include/exclude filtering, token-aware context preparation;
- LLMLingua -> **experimental lossy compression only after a faithful L2/L1 representation exists**.

Tool availability is not permission.

## LLMLingua / lossy-compression gate

Never use lossy semantic compression as the sole representation for:
- approval scope;
- legal/compliance language;
- exact financial or measurement values;
- credentials/security instructions;
- irreversible-action instructions;
- user-provided wording explicitly marked exact;
- conflicting evidence.

For experiments, compare compressed output to the protected must-preserve atoms and measure instruction/numeric/source fidelity. Reject compression if fidelity falls.

## Token discipline

Token reduction is useful only when downstream quality is preserved.

Measure:
- original token estimate;
- compiled token estimate;
- reduction ratio;
- must-preserve recall;
- numeric fidelity;
- source traceability;
- downstream task success.

A shorter prompt that causes worse execution is a regression. A compiled packet that is not actually shorter is also a regression unless it explicitly returns `NO_SAFE_REDUCTION`.

## Handoff contract

A Fikri handoff should contain:
1. L0 Dispatch Card;
2. selected L1 sections;
3. links/pointers to L2;
4. explicit protected atoms;
5. provenance map;
6. compression method used, if any;
7. anything intentionally omitted and why.

## Learning loop

After downstream execution, record:
- what context turned out to be unnecessary;
- what missing context caused retries;
- what exact constraint was almost lost;
- which compaction pattern improved success.

Repeated, evidence-backed lessons may become a skill candidate. They do not silently rewrite this canonical skill.
