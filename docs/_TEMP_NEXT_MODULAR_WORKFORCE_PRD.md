# TEMP — Next Modular Workforce PRD

> Status: DESIGN / RESEARCH ONLY  
> Branch: `prd/next-modular-workforce`  
> Baseline: `main` after merged PR #9 (2026-09-29)  
> Delete this temporary document after the implementation is completed and permanent docs are updated.

## 0. Why this PRD exists

nyobakantorai already has a 16-worker registry, generated Hermes profiles, role-specific skills, profile-scoped memory policy, learning profiles, optional integrations, provenance metadata, safety boundaries, and a local evidence/approval control plane.

This PRD does **not** repeat the work merged in PR #9.

The next problem is different:

1. Make each employee independently distributable.
2. Let users install one, two, several, or all employees without cloning/installing the entire office.
3. Turn each employee from a character/profile into a typed operational component with explicit capability contracts.
4. Research a wider ecosystem of skills, tools, MCP servers, plugins/extensions, hooks, workflows, memory systems, document/context utilities, and evaluation patterns.
5. Map those capabilities selectively by employee role instead of making every employee a generic super-agent.
6. Keep attribution, license, source commit, and adaptation mode explicit.
7. Make memory and learning useful over time without allowing hidden self-modification of permissions, policy, or canonical skills.
8. Strengthen one employee as a dedicated context/prompt/Markdown/token-efficiency specialist.
9. Prove usefulness with real tasks and measurable evaluations instead of only adding more architecture.

The core product principle remains:

`configured != connected != executed != succeeded != verified`

---

# 1. Product vision

A user should be able to say:

- "I only want Siti."
- "Give me Praroro + Siti."
- "I need the engineering pair: Subagjo + Bimo."
- "Install the growth pod: Paijo + Maya + Gugun + Ratri + Nara."
- "Install the whole office."

And receive exactly that workforce, with:

- the correct profile;
- only the worker's required skills;
- explicit optional capabilities;
- no copied credentials;
- no silent external permissions;
- provenance and license metadata;
- deterministic checksums;
- a memory boundary;
- a learning policy;
- an install/upgrade/uninstall path;
- a capability manifest that tells the truth about what is actually usable.

The office UI remains useful, but **employee packs must not require the visual office to exist**.

---

# 2. Non-goals

This work will **not**:

- silently enable production writes;
- auto-install paid services;
- auto-import user credentials;
- give every employee every tool;
- merge all memories into one global brain;
- let runtime memories silently rewrite canonical repository skills;
- claim an MCP/plugin is active just because a config entry exists;
- vendor third-party source text when the license does not clearly allow it;
- introduce autonomous external dispatch merely to make demos look impressive;
- add more employees until the current 16 are measurably useful.

---

# 3. Baseline already implemented

Current `main` already provides:

- 16 canonical employees in `config/employees.json`;
- generated Hermes distributions under `hermes-profiles/<employee>/`;
- generated agent definitions;
- role-specific skill mappings;
- per-profile learning focus;
- profile-scoped memory boundary;
- approval and independent-verification policy;
- optional integrations;
- upstream provenance registry;
- recreated skills based on ECC / Superpowers / MCP / memory concepts;
- MarkItDown-oriented Markdown workflow;
- fail-closed external capability semantics.

This PRD therefore treats PR #9 as the starting point, not as future work.

---

# 4. Capability taxonomy

The word "skill" is too overloaded. The next architecture must classify abilities explicitly.

Every employee capability must have a `kind`:

| Kind | Meaning | Example |
| --- | --- | --- |
| `skill` | procedural knowledge loaded on demand | systematic debugging |
| `tool` | local executable/library capability | Lighthouse CLI |
| `mcp` | MCP server exposing tools/resources | Playwright MCP |
| `plugin` | installable capability bundle | Superpowers for Hermes |
| `extension` | host-specific extension bundle | Gemini CLI extension |
| `workflow` | multi-step process/orchestration contract | research -> analyze -> review |
| `memory` | state/memory provider or memory procedure | Hermes profile memory, Cognee candidate |
| `hook` | lifecycle interception / validation | before-tool policy check |
| `adapter` | provider/runtime bridge | Meta Ads provider adapter |
| `policy` | permission/approval constraint | no paid write without approval |

Every capability also declares:

- `source_id`;
- `source_commit` when external;
- `license`;
- `usage_mode`;
- `default_state`;
- `risk_class`;
- `required_by`;
- `optional_for`;
- `platforms`;
- `install_method`;
- `verification_method`.

Allowed `usage_mode` values:

- `original`
- `copied-with-license`
- `adapted`
- `recreated-concepts`
- `optional-upstream-dependency`
- `reference-only`
- `excluded-license-boundary`

This prevents vague wording like "inspired by GitHub" from hiding what actually happened.

---

# 5. Portable employee pack

## 5.1 Pack objective

Each employee must be exportable as an independently installable artifact.

Proposed generated artifact:

```text
dist/employees/praroro/
  employee-pack.yaml
  README.md
  profile/
    SOUL.md
    profile.yaml
    config.yaml
    distribution.yaml
  skills/
    ...
  integrations/
    optional-integrations.json
  provenance/
    SOURCES.json
    LICENSES.md
  checksums.json
```

The generated pack is derived from canonical repository data. It is **not** a second source of truth.

## 5.2 Pack manifest

Minimum fields:

```yaml
schema: 1
pack_id: nyobakantorai.praroro
employee_id: praroro
employee_name: Praroro
role: COO / Chief of Staff
version: 0.4.0-dev
runtime:
  primary: hermes
  requires:
    - hermes-compatible-profile-distribution
skills_standard:
  compatible: agent-skills
memory:
  default: profile-scoped
capabilities:
  bundled: []
  optional: []
  prohibited: []
provenance:
  manifest: provenance/SOURCES.json
checksums:
  manifest: checksums.json
```

## 5.3 Selective installation UX

Target commands:

```bash
# one employee
./install.sh --employees praroro

# several
./install.sh --employees praroro,siti

# full workforce
./install.sh --employees all
```

PowerShell equivalent:

```powershell
.\install.ps1 -Employees praroro,siti
```

Developer/export commands:

```bash
node scripts/employee-pack.mjs --employee praroro
node scripts/employee-pack.mjs --employees praroro,siti
node scripts/employee-pack.mjs --all
node scripts/employee-pack.mjs --check
```

The installer must resolve the employee's **skill dependency closure** automatically.

## 5.4 Release assets

A release may publish:

```text
nyobakantorai-praroro-vX.Y.Z.zip
nyobakantorai-siti-vX.Y.Z.zip
...
nyobakantorai-full-workforce-vX.Y.Z.zip
SHA256SUMS.txt
```

Each ZIP must be reproducible from the same tagged source.

## 5.5 No permission escalation through installation

Installing a pack must not mean:

- external account connected;
- API token available;
- paid action authorized;
- browser profile authorized;
- production write enabled.

Optional integrations remain `NOT_INSTALLED` / `NOT_CONNECTED` until the user explicitly configures them.

---

# 6. Portable skill strategy

## 6.1 Do not invent another proprietary skill format

Research indicates the ecosystem is converging around filesystem-based Agent Skills:

- `SKILL.md` entrypoint;
- YAML metadata;
- optional scripts, references, assets;
- progressive disclosure;
- on-demand loading.

nyobakantorai should remain Hermes-first at runtime while maximizing portability of procedural skills.

Target:

```text
Hermes profile
  -> loads nyobakantorai skills
  -> skills conform as closely as practical to Agent Skills conventions
  -> pack can later expose adapters for Copilot / Gemini CLI / Codex-compatible clients
```

Host-specific wrappers are adapters. The canonical procedure should not be duplicated per host.

## 6.2 Progressive disclosure

Do **not** load every skill body into every worker prompt.

Each worker should have:

1. minimal always-on identity + safety kernel;
2. skill metadata index;
3. task-triggered skill loading;
4. optional external capability discovery;
5. explicit verification after execution.

This is both a specialization rule and a token-efficiency rule.

---

# 7. Common kernel for all 16 employees

All employees should share a small invariant kernel, not a giant shared skill set.

Mandatory common capabilities:

1. **Task truth** — never equate configuration/status with completed work.
2. **Safe tool use** — permissions and risk class before action.
3. **Approval + evidence** — high-impact operations require scoped approval.
4. **Reflective memory learning** — remember useful lessons inside the profile boundary.
5. **Source/provenance awareness** — distinguish source facts, inference, and model-generated content.
6. **Capability discovery** — load the narrowest relevant skill/tool instead of improvising a universal solution.
7. **Completion honesty** — a worker may report completed work only with the expected artifact/evidence.
8. **Context budget discipline** — preserve the task, constraints, source truth, and decisions before adding extra context.

Specialist capabilities remain role-specific.

---

# 8. Memory and "skills that grow"

## 8.1 The requirement

Every employee must improve from interaction history, but "improve" must not mean hidden self-modification.

## 8.2 Memory layers

Proposed memory model:

### M0 — Turn scratch
Temporary reasoning state. Not durable.

### M1 — Profile episodic memory
What happened in prior tasks:
- error encountered;
- correction received;
- successful workaround;
- failed approach;
- user-approved preference relevant to the role.

Default: Hermes profile memory.

### M2 — Profile semantic lessons
Durable normalized lessons derived from repeated episodes.

Example:
- "For this account, conversion value uses gross revenue, not net revenue."
- "This repository uses squash merge."
- "This client requires evidence screenshots after every paid-media mutation."

### M3 — Shared/project knowledge
Explicitly promoted knowledge accessible to more than one worker.

Requires:
- scope;
- source;
- owner;
- timestamp;
- confidence/evidence;
- no secrets by default.

### M4 — Canonical skill candidate
A proposed reusable procedure change.

A worker may generate a **skill candidate**, but may not silently merge it into canonical skills.

Promotion rule:
- repeated evidence, normally 3+ independent observations, **or**
- explicit human rule;
- then review;
- then repository PR;
- then tests;
- then merge.

## 8.3 What memory must never become

Memory is not:

- authorization;
- a credential vault;
- proof of external execution;
- permission to widen autonomy;
- permission to change approval policy;
- permission to rewrite another worker's profile;
- automatically trusted source material.

## 8.4 Optional memory provider research

Hermes profile memory stays the default.

Candidates such as Mem0, Letta, and Cognee are evaluated for:
- profile isolation;
- deletion/export;
- provenance;
- retrieval quality;
- local-first operation;
- cost;
- failure behavior;
- secret handling.

Cognee now has a Hermes integration candidate and is worth evaluating, but shared graph memory must not collapse profile boundaries by default.

---

# 9. Dedicated context / prompt / Markdown specialist

## 9.1 Worker choice

Use **Fikri** rather than adding a 17th employee.

Current Fikri already owns knowledge, Markdown, source integrity, compaction, and skill engineering. This role should be sharpened into:

> **Knowledge / Context / Prompt Engineer**

Personality may remain. Operational identity changes through capability contract.

## 9.2 Fikri responsibilities

Fikri becomes the default specialist for:

- document -> Markdown normalization;
- source-preserving summaries;
- prompt cleanup;
- prompt strengthening without changing intent;
- converting long requests into structured execution briefs;
- building token-light task packets for another worker;
- L0/L1/L2 knowledge compaction;
- codebase context packing;
- removing duplicated context;
- extracting constraints, acceptance criteria, files, entities, and dependencies;
- preserving exact user instructions that must not be compressed away;
- producing a provenance map from source -> compressed brief.

## 9.3 Context levels

### L0 — Dispatch card
Very small:
- objective;
- owner;
- must-preserve constraints;
- inputs;
- expected artifact;
- risk;
- verification.

### L1 — Working brief
Enough context to execute:
- task background;
- decisions;
- relevant evidence;
- file/source references;
- open questions;
- acceptance criteria.

### L2 — Canonical notes
Full source-preserving Markdown representation with provenance.

Workers normally receive L0 + selected L1. L2 is loaded only when needed.

## 9.4 Candidate tools

### MarkItDown
Use for common document-to-Markdown conversion.

### Docling
Evaluate for structured documents/tables/layout where lightweight conversion loses important structure.

### Repomix
Use for repository/codebase packing, token counting, include/exclude rules, and compressed code structure.

### LLMLingua
**Experimental only.**
It may reduce tokens aggressively, but semantic compression can remove wording that matters.

It must never be the only representation for:
- approval scope;
- legal/compliance text;
- credentials/security instructions;
- numerical source evidence;
- exact user requirements;
- irreversible action instructions.

Any LLMLingua-based mode requires fidelity evaluation against the original source.

## 9.5 Prompt compiler output

Fikri should be able to emit a machine-readable brief:

```json
{
  "objective": "...",
  "must_preserve": [],
  "constraints": [],
  "inputs": [],
  "sources": [],
  "requested_actions": [],
  "risk_classes": [],
  "expected_artifacts": [],
  "verification": [],
  "open_questions": [],
  "token_budget": {
    "target": 0,
    "original_estimate": 0,
    "compiled_estimate": 0
  }
}
```

This is not a replacement for the original prompt; it is an execution representation with traceability.

---

# 10. External research candidates

This list is a **research/adoption queue**, not an automatic dependency list.

## A. Standards / cross-harness portability

### agentskills/agentskills
Use:
- canonical Agent Skills packaging concepts;
- progressive disclosure;
- portable skill folder structure.

Mode:
- standards reference;
- compatibility target.

### github/awesome-copilot
Use:
- candidate discovery;
- examples of agents, skills, instructions, hooks, plugins;
- packaging and quality patterns.

Important:
- community-contributed collection;
- inspect provenance/license of each imported candidate;
- do not bulk-copy the repository into nyobakantorai.

### google-gemini/gemini-cli
Use:
- extension architecture reference;
- bundled skills + MCP + hooks + sub-agent pattern;
- hook/policy concepts for lifecycle validation.

Mode:
- architecture reference, not runtime dependency.

## B. Engineering workflows

### obra/superpowers
Already adopted conceptually and optionally as a Hermes plugin.

Continue using selectively for:
- Praroro;
- Subagjo;
- Bimo;
- Alex where planning/research applies.

Do not distribute every Superpowers workflow to non-engineering roles by default.

### anthropics/skills — mcp-builder only
Continue adapted concepts where license permits.

Do not copy restricted document skills.

### modelcontextprotocol/servers
Use as reference for MCP contracts and reference patterns.

## C. Context / documents / token efficiency

### microsoft/markitdown
Optional local integration for document -> Markdown.

### docling-project/docling
Reference / optional tool candidate for complex structured documents.

### yamadashy/repomix
Optional context-pack tool for codebase-aware workers.

### microsoft/LLMLingua
Experimental prompt/context compression evaluation for Fikri.

### jina-ai/reader
Reference/optional web-to-Markdown path where appropriate.

## D. Memory

### mem0ai/mem0
Memory lifecycle concepts.

### letta-ai/letta
Stateful-agent concepts and memory boundaries.

### topoteretes/cognee / cognee-integrations
Evaluate a Hermes-native persistent memory provider candidate.

Default remains profile-scoped Hermes memory until isolation and deletion/export semantics pass tests.

## E. Browser / web operation

### microsoft/playwright-mcp
Strong candidate for deterministic structured browser operations.

Potential workers:
- Alex;
- Ratri;
- Maya;
- Gugun;
- Caca;
- Siti for verification.

External writes remain approval-gated.

### browser-use/browser-use
Alternative higher-level browser-agent capability.

Use only after comparing:
- reliability;
- observability;
- auth handling;
- token/model cost;
- deterministic evidence;
- failure recovery.

## F. Domain tools

### GoogleChrome/lighthouse
Ratri:
- web performance;
- SEO;
- accessibility;
- best-practice audits;
- machine-readable reports.

### pola-rs/polars
Paijo / Nara:
- local structured-data analysis candidate;
- large dataset handling;
- reproducible transformations.

These are tools, not "AI skills"; that distinction is intentional.

---

# 11. Employee capability map

This table is the desired direction. It does not mean every optional dependency is installed.

| Employee | Primary operational identity | Core specialist capability direction | Candidate external references/tools |
| --- | --- | --- | --- |
| **Praroro** | COO / orchestrator | task decomposition, routing, delegation contracts, decision packets, dependency graph, completion receipts | Superpowers planning, Agent Skills discovery, optional memory research |
| **Paijo** | Quant / Growth / Finance | metric sanity, scenario modeling, attribution assumptions, anomaly detection, unit economics | Polars optional, structured evidence tables |
| **Subagjo** | Engineering / Operations | code, CI, rollback, debugging, security boundaries, implementation verification | Superpowers, Agent Skills, MCP builder, GitHub patterns, Playwright for tests |
| **Alex** | Strategy / Research | source triangulation, competing hypotheses, market/technical research, decision memos | browser capability, Jina/Markdown, Superpowers brainstorming |
| **Sumiati** | Creative / Communications | briefs, brand copy, campaign concepts, channel adaptation | creative skill library only; no engineering/tool bloat |
| **Siti** | QA / Compliance / Knowledge | independent evidence review, adversarial verification, provenance, acceptance criteria | verification skills, Playwright read/check, Markdown conversion |
| **Maya** | Meta Ads Operator | Meta analysis, change proposal, guarded mutations, creative testing, post-change verification | provider adapter when available, browser fallback only with policy |
| **Gugun** | Google Ads Operator | search-term analysis, negatives, assets, budget/bid diagnostics, guarded mutations | provider adapter when available, browser fallback only with policy |
| **Ratri** | SEO / CRO / Web Analyst | crawl/audit, intent, analytics reasoning, landing-page QA, performance | Lighthouse, Playwright MCP, MarkItDown, browser tools |
| **Bimo** | Automation / MCP Engineer | MCP contracts, connectors, auth scopes, webhooks, idempotency, tool orchestration | MCP refs, Anthropic mcp-builder concepts, Gemini extension/hook architecture |
| **Nara** | Data / BI / Experimentation | data cleaning, metric definitions, experiment readout, reproducible analysis | Polars optional, Docling/MarkItDown for data-bearing docs |
| **Dina** | Client / Project Operations | intake, timeline, meeting-to-actions, follow-up records, project state | Markdown conversion, schedule/communication adapters when explicitly connected |
| **Bambang** | Automation / Queue Optimizer | repetitive-work detection, batch design, workflow simplification, retry/queue patterns | local scripts, cron/workflow patterns; avoid unnecessary SaaS dependencies |
| **Fikri** | Knowledge / Context / Prompt Engineer | prompt compiler, document normalization, context packing, token budgeting, skill candidates | MarkItDown, Docling, Repomix, LLMLingua experimental, Agent Skills |
| **Tari** | Execution / Follow-Up | closure, stale-task detection, commitment tracking, escalation timing | checklist/workflow engine, scheduler when connected |
| **Caca** | Community / Social / Partnerships | social listening, outreach research, response strategy, partnership fit | browser research, brand safety; posting capability only with explicit connector + approval |

---

# 12. Role specialization rules

A worker must **not** receive a capability only because it is impressive.

Add a capability only when all are true:

1. it improves a repeated role task;
2. the worker has a clear input/output contract for it;
3. the capability can be verified;
4. its risk class is understood;
5. provenance/license are acceptable;
6. it does not substantially duplicate an existing capability;
7. it does not create more context/tool noise than value.

If two workers can do the same thing, the overlap must have a reason:
- producer/reviewer separation;
- fallback;
- different level of abstraction;
- handoff workflow.

---

# 13. Typed employee contract

Every worker must eventually expose:

```yaml
role:
capabilities:
inputs:
outputs:
allowed_tools:
forbidden_tools:
optional_integrations:
memory_boundary:
learning_policy:
approval_policy:
evidence_requirements:
failure_policy:
verification_method:
cost_ceiling:
sla:
```

Personality is UX.

The operational contract is engineering identity.

---

# 14. Capability states

Every optional capability must use honest state:

- `BUNDLED`
- `AVAILABLE_LOCAL`
- `NOT_INSTALLED`
- `INSTALLED_NOT_CONNECTED`
- `CONNECTED_READ_ONLY`
- `CONNECTED_GUARDED_WRITE`
- `DELEGATED_SCOPED`
- `UNAVAILABLE`
- `BLOCKED_BY_POLICY`
- `UNKNOWN`

"Configured" is never a substitute for a runtime state.

---

# 15. Provenance requirements

Every third-party-derived capability must record:

- repository URL;
- source commit SHA;
- retrieval/review date;
- license;
- files/concepts used;
- usage mode;
- transformation notes;
- copied vs rewritten status;
- required notices;
- whether source is bundled, optional, or reference-only.

Example:

```json
{
  "source_id": "repomix",
  "repo": "https://github.com/yamadashy/repomix",
  "commit": "<pinned SHA>",
  "license": "MIT",
  "usage_mode": "optional-upstream-dependency",
  "used_for": ["codebase context packing"],
  "copied_files": []
}
```

CI must fail when a capability references an unknown `source_id`.

---

# 16. Research snapshot — 2026-09-29

New candidate commits inspected for this PRD:

| Source | Commit |
| --- | --- |
| `agentskills/agentskills` | `69ef37e9424c0a7ea9dd2293b559e43ec8176379` |
| `github/awesome-copilot` | `6efe0d035a6415137153bb9b3959589191b7afbe` |
| `google-gemini/gemini-cli` | `fe6350238c1862dade66a9dea9080c6508475bec` |
| `microsoft/LLMLingua` | `5a4c78ae18ab17a98cf997e8259354e546081d64` |
| `yamadashy/repomix` | `0b3f82b401bbc520fd1aca67c06d24e40a868d3e` |
| `topoteretes/cognee-integrations` | `3323e30a71564eccc1794b8c4a0bac84fc3d2b30` |
| `microsoft/playwright-mcp` | `f183dad4a52965583e3cc1d59b88cdc279e2e57d` |
| `browser-use/browser-use` | `4cbe921673b48a488f5415d9159249afd12a625b` |

These are research pins, not dependency lock decisions.

Before implementation, exact licenses and redistribution terms must be re-verified at the pinned source.

---

# 17. Evaluation is a product requirement

The project must not turn into a larger architecture without proving user value.

## 17.1 Employee pack tests

For every employee pack:

- fresh export succeeds;
- checksums stable;
- no secret/private path leakage;
- required skill dependency closure complete;
- optional integration remains disabled;
- profile installs independently;
- uninstall does not remove unrelated profiles;
- upgrade preserves user-owned memory/config where appropriate.

## 17.2 Memory isolation tests

Prove:

- Praroro memory cannot silently appear inside Maya;
- shared memory requires explicit promotion/handoff;
- secret-like data is rejected from shared promotion;
- deleting a profile's memory is possible;
- canonical skills are unchanged by runtime learning.

## 17.3 Fikri context benchmark

Build a benchmark set containing:

- long user prompts;
- messy pasted specs;
- PDFs converted to Markdown;
- tables;
- codebase context;
- conflicting requirements;
- exact numeric constraints;
- approval instructions.

Measure:

- original tokens;
- compiled tokens;
- reduction ratio;
- must-preserve recall;
- numeric fidelity;
- source-link fidelity;
- instruction fidelity;
- worker task success before vs after compilation.

Token savings alone do not count as success.

## 17.4 Real-task evaluation

At minimum, publish a repeatable evaluation set covering:

- research;
- data analysis;
- coding;
- SEO;
- marketing;
- QA;
- operations;
- content;
- browser operation;
- workflow automation.

Track:

- task success rate;
- evidence completeness;
- false-success rate;
- human intervention rate;
- retries;
- latency;
- cost;
- verification accuracy;
- recovery after tool/provider failure.

The next release should improve measurable task execution, not merely increase worker/tool count.

---

# 18. Security requirements

1. Employee packs contain no credentials.
2. External capability installation is opt-in.
3. Browser tools do not automatically reuse sensitive profiles.
4. External writes remain approval-gated by risk class.
5. Memory is never authority.
6. Prompt/context compression cannot delete approval or safety scope.
7. Tools running with local file/network privileges must be documented.
8. Capability manifests must distinguish procedure from permission.
9. Pack installer must not execute arbitrary third-party postinstall logic without an explicit user-visible step.
10. Provider/memory/browser adapters must have a failure state that is not misreported as success.

---

# 19. Proposed permanent architecture after implementation

```text
config/
  employees.json
  capabilities.json
  upstream-sources.json
  integrations.json

skills/
  hermes-custom/
    <portable Agent-Skills-compatible skills>

employee-packs/
  schema.json
  presets.json

scripts/
  generate-workforce.mjs
  employee-pack.mjs
  install-selective.mjs
  validate-capability-manifests.mjs
  validate-memory-boundaries.mjs

dist/                    # generated, release artifact only
  employees/
    <id>/

evaluations/
  tasks/
  context-compaction/
  verifier-adversarial/
  failure-recovery/
```

Generated artifacts must never become the canonical editing surface.

---

# 20. Preset bundles

Useful optional bundles:

- `leadership`: Praroro + Siti + Fikri
- `engineering`: Subagjo + Bimo + Siti
- `growth`: Paijo + Maya + Gugun + Ratri + Nara
- `research`: Alex + Fikri + Siti
- `operations`: Dina + Tari + Bambang + Praroro
- `creative-community`: Sumiati + Caca + Alex
- `full`: all 16

Presets are convenience only. Users can always choose arbitrary combinations.

---

# 21. Acceptance criteria

This PRD is complete when the implementation can prove all of the following:

### Packaging
- any 1 employee can be exported and installed independently;
- any arbitrary subset can be installed;
- full install remains supported;
- output is reproducible;
- pack provenance is complete.

### Specialization
- no employee becomes a universal catch-all;
- each employee has a typed capability contract;
- common kernel remains small;
- specialist skills are role-mapped.

### Memory / learning
- all 16 have profile-scoped learning;
- runtime learning can create memories and skill candidates;
- canonical skill modification requires review/PR;
- shared memory is explicit.

### Fikri
- document -> Markdown;
- prompt -> structured execution brief;
- L0/L1/L2 context output;
- measurable token-budget reporting;
- source traceability;
- compression safety rules.

### Provenance
- all external references have source, commit, license state, usage mode;
- CI rejects unknown sources;
- restricted sources are explicitly excluded.

### Truth / safety
- optional integration never implies connection;
- write permissions remain explicit;
- no credentials bundled;
- failures remain distinguishable from completion.

### Evaluation
- baseline vs enhanced comparison exists;
- real task outcomes measured;
- token reduction measured alongside fidelity;
- verification and recovery tested.

---

# 22. Delivery principle

The next step is **not** "add 50 tools."

The sequence is:

```text
portable employee contract
-> selective packaging
-> capability manifest
-> specialist capability mapping
-> memory/learning isolation
-> Fikri context pipeline
-> optional integrations
-> evaluation
-> only then broader live adapters
```

A smaller number of proven capabilities is better than a large list of badges in a README.

---

# 23. Temporary-document cleanup

When implementation is complete:

1. move durable decisions into permanent architecture docs;
2. update `ROADMAP.md`;
3. update source/provenance catalogs;
4. update installer docs;
5. update employee architecture docs;
6. delete this `_TEMP_` PRD;
7. delete the temporary workplan;
8. keep final ADRs/evaluation reports that remain useful.
