# nyobakantorai

**nyobakantorai is a local-first, human-governed multi-agent office for coordinating role-based AI workers with explicit evidence, provenance, and approval boundaries.**

It combines a visual office, a canonical workforce registry, installable employee profiles, runtime adapters, execution receipts, and release/evidence checks. The project is designed so that a configured model, a moving avatar, or a task label is **not** treated as proof that work actually happened.

![nyobakantorai office overview](docs/assets/office-overview.png)

## Project status — 30-chat roadmap complete, v1.0 candidate is evidence-blocked

The implementation roadmap through **CHAT 30** is complete on `main`. The final production-convergence work was merged in PR #56 and exact promoted `main` passed Linux, Windows, and minimum-version verification.

That does **not** mean `v1.0.0` is published. The v1 gate is intentionally fail-closed.

Current v1 evidence state:

- security-control convergence — **PASS**;
- release-claim/evidence audit — **PASS**;
- production install/migration matrix — **PASS** across one-worker, subset, full-workforce, and lifecycle cases;
- real-world workflow evidence — **BLOCKED**, currently 1/20 eligible real tasks;
- provider lifecycle — **BLOCKED**, currently `partial`;
- representative live failure/recovery evidence — **BLOCKED**;
- v0.9 prerequisite chain — **BLOCKED**.

Therefore the published stable package remains **v0.5.1**. There is no authorized `v1.0.0` tag or GitHub Release yet.

See [v1.0 Production Evidence Convergence](docs/V1.0-PRODUCTION-CONVERGENCE.md) and [v1.0 Operator Runbook](docs/V1.0-OPERATOR-RUNBOOK.md).

## Current release — v0.5.1

`v0.5.1` is the current published stable release.

| Item | Current state |
| --- | --- |
| Latest stable release | [`v0.5.1`](https://github.com/exxrawrrr/nyobakantorai/releases/tag/v0.5.1) |
| Release source commit | `3004220522fee1971453f63bb50e6f9ed1264687` |
| Published release assets | 25 |
| Artifact maturity | `stable` |
| Contract/API maturity | `stable` |
| Runtime-adapter maturity | `stable` |
| Behavioral evidence | `evaluated-case` |
| Real-world workflow evidence | `collecting` — 1/20 eligible cases |
| Provider lifecycle | `partial` |

The release passed Linux, Windows, and minimum-version verification, an exact-main manual release gate, immutable tagged-asset verification, and a post-release isolated installer smoke test. The published install manifest points back to the exact tagged source commit, and the published core ZIP/TAR checksums match the release checksum file.

This **does not** mean the project is broadly production-proven, that every provider lifecycle is complete, or that all runtimes behave identically. Those claims remain outside the evidence currently available.

The earlier `v0.5.0` tag is intentionally preserved as a failed publication attempt. It was not rewritten or presented as a successful release.

## v0.6.0 candidate status — release blocked

The v0.6.0 Live Workforce implementation has converged through CHAT 12, but it is **not a published release**.

The end-to-end acceptance mission passed **9 of 11** criteria. Two mandatory live criteria remain blocked:

- `REAL_MODEL_EXECUTION`
- `COST_QUOTA_ENFORCEMENT`

Fresh current-commit Codex and Hermes observations both ran inside the canonical Live Sandbox and verified teardown, but neither produced qualifying `LIVE_RUNTIME_EVIDENCE`. The repository therefore keeps `v0.5.1` as the stable release, keeps package metadata at `0.5.1`, and fails closed if someone attempts to publish tag `v0.6.0` before readiness becomes `READY`.

See [v0.6.0 Release Convergence](docs/V0.6-RELEASE-CONVERGENCE.md).

## v0.6.1 reliability status — verified, release blocked

The v0.6.1 reliability feature set is **repository-verified**, covering:

- Full Cost Governor;
- Artifact Workspace + Execution Replay;
- Checkpoint + Failure Recovery;
- Project Brain / Memory 2.0.

That does **not** authorize a v0.6.1 release. The prerequisite v0.6.0 release is still blocked on `REAL_MODEL_EXECUTION` and `COST_QUOTA_ENFORCEMENT`, so v0.6.1 cannot leapfrog it. Package metadata remains `0.5.1`, no `v0.6.1` tag or GitHub Release is authorized, and the tagged-release workflow fails closed unless v0.6.1 readiness becomes `READY`.

See [v0.6.1 Reliability Release Gate](docs/V0.6.1-RELIABILITY-RELEASE-GATE.md).


## What the project currently provides

- a local visual office for seeing workers, tasks, state, and evidence;
- 16 role-specific employee profiles from one canonical registry;
- installable one-worker, subset, preset-team, and full-workforce packages;
- human approval gates for external writes, paid actions, account changes, and destructive actions;
- signed execution receipts and evidence-verification paths;
- a Hermes-first reference runtime plus provider-neutral runtime-adapter contracts;
- explicit states for configured / connected / executed / succeeded / verified;
- local diagnostics, release checks, public-safety scans, and immutable stable-install verification;
- machine-readable capability, maturity, evidence, and release-readiness surfaces.

## What it does not claim

nyobakantorai is **not** presented as a finished autonomous company or a broadly production-proven agent platform.

The current evidence does not justify claims of universal runtime parity, repeated real-world reliability, complete provider lifecycle validation, or automatic correctness of external actions. External credentials, provider accounts, billing state, sessions, and user data remain user-owned.

## Core model

```text
human intent
    ↓
scoped task
    ↓
agent role / runtime
    ↓
work product
    ↓
evidence + provenance
    ↓
independent verification
```

A task state, model response, or named reviewer is not treated as independent evidence by itself.

## Highlights

- **16 role-specific employee profiles** driven by one canonical registry, with distinct roles, skills, routing, approval, verification policy, and installable profile distributions.
- **Standalone employee packs** so users can install/download one worker, an arbitrary subset, a preset team, or the full workforce.
- **Signed execution receipts** with Ed25519 tamper detection, task/worker/capability binding, normalized token/cost fields, and evidence-verifier integration.
- **Canonical reusable skills** spanning task truth, tool safety, ads operations, SEO/CRO, data, integrations, operations, community, governance, and independent QA.
- **Evidence-gated task state** where VERIFIED requires independent evidence.
- **Human approval gate** for external writes, paid actions, account changes, and destructive actions.
- **Hermes-first reference runtime** with sixteen installable Hermes profile distributions and an idempotent, v0.2-upgrade-safe bootstrap.
- **Read-only runtime adapter SDK** with a strict loopback HTTP adapter for plugging in other local runtimes without granting write or dispatch authority.
- **Manual handoff + receipt protocol** for provenance-aware work across surfaces.
- **Portable diagnostics** that check expected safety boundaries without printing secrets.
- **Machine-readable capabilities** through `GET /api/capabilities`.
- **Public-release guardrails** for tests, builds, private-path leakage, sensitive filenames, and credential-shaped strings.
- **Zero npm runtime dependencies** for the main office server.

## Workforce

```text
SOUL    = who the employee is
SKILL   = reusable procedure / knowledge
TOOL    = executable Hermes capability
MCP     = external capability connection
PROFILE = complete installable employee package
```

Credentials, account access, provider billing state, sessions, memory, and messaging tokens remain **user-owned**. A preferred toolset or external-capability declaration does not mean it is connected.

| Employee | Department | Role | Visual | External capability default |
| --- | --- | --- | --- | --- |
| **Praroro** | Leadership / Coordination | COO / Chief of Staff | owner-authored | none required |
| **Paijo** | Growth / Data | Quant / Growth / Finance | owner-authored | none required |
| **Subagjo** | Engineering / Automation | Engineering / Operations | owner-authored | none required |
| **Alex** | Strategy / Research | Strategy / Research | owner-authored | none required |
| **Sumiati** | Creative / Community | Creative / Communications | owner-authored | none required |
| **Siti** | QA / Governance | QA / Compliance / Knowledge | owner-authored | none required |
| **Maya** | Paid Media | Meta Ads Operator | pending-original-art | `ads.meta.read`, `ads.meta.insights`, `ads.meta.creative`, `ads.meta.write`, `ads.meta.media` → NOT_CONNECTED |
| **Gugun** | Paid Media | Google Ads Operator | pending-original-art | `ads.google.read`, `ads.google.insights`, `ads.google.keywords`, `ads.google.creative`, `ads.google.write`, `ads.google.verify` → NOT_CONNECTED |
| **Ratri** | Growth / Data | SEO / CRO / Web Analyst | pending-original-art | none required |
| **Bimo** | Engineering / Automation | Automation / MCP / Integrations Engineer | pending-original-art | none required |
| **Nara** | Growth / Data | Data / BI / Experimentation | pending-original-art | none required |
| **Dina** | Operations | Client / Project Operations | pending-original-art | none required |
| **Bambang** | Engineering / Automation | Automation / Queue Optimizer | pending-original-art | none required |
| **Fikri** | QA / Governance | Knowledge / Markdown / Context / Prompt Engineer | pending-original-art | none required |
| **Tari** | Operations | Execution / Follow-Up Specialist | pending-original-art | none required |
| **Caca** | Creative / Community | Community / Social / Partnerships | pending-original-art | none required |

Maya and Gugun are capability **consumers**, not bundled ads engines. Telegram is an optional Hermes gateway path. See the dedicated docs below.

### Upstream skill enrichment

The workforce uses recreated/adapted workflow concepts with explicit provenance from ECC, Superpowers, MarkItDown, Docling, Mem0, Letta, Jina Reader, MCP reference servers, and Anthropic's Apache-2.0 MCP builder. See [UPSTREAM-SOURCE-CATALOG.md](docs/UPSTREAM-SOURCE-CATALOG.md). Restricted Anthropic document skills are not copied or used to create derivatives.

**Fikri** is the default Knowledge / Markdown / Context / Prompt Engineer. See [MARKDOWN-KNOWLEDGE.md](docs/MARKDOWN-KNOWLEDGE.md).
## Install

There are two explicit installation paths.

### For people

The normal installer defaults to the latest **published immutable stable release**.

**Windows PowerShell**

```powershell
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.ps1))) -WithHermes -Start
```

**Linux / macOS / WSL2**

```bash
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.sh | bash -s -- --with-hermes --start
```

Full human guide: **[docs/INSTALL-HUMAN.md](docs/INSTALL-HUMAN.md)**.

### For AI agents

Agents use a separate fail-closed wrapper. It is **plan-only by default**:

```bash
node scripts/ai-installer.mjs --with-hermes --employees all
```

Only explicit `--apply` performs installation through the canonical platform installer:

```bash
node scripts/ai-installer.mjs --apply --with-hermes --employees all
```

It emits machine-readable JSON, defaults to stable immutable releases, accepts no secret argument, and never silently converts stable installation into a mutable `main` checkout.

Full agent guide: **[docs/INSTALL-AI.md](docs/INSTALL-AI.md)**.

### Employee selection

All installer paths support one worker, comma-separated subsets, or presets:

```bash
node scripts/ai-installer.mjs --employees siti
node scripts/ai-installer.mjs --employees praroro,siti
node scripts/ai-installer.mjs --employees growth
```

Presets: `leadership`, `engineering`, `growth`, `research`, `operations`, `creative-community`, and `full`.

### Mutable development path — explicit opt-in only

Stable integrity failure never falls back to mutable `main`. Development source requires explicit opt-in.

**Linux / macOS / WSL2**

```bash
curl -fsSL https://raw.githubusercontent.com/exxrawrrr/nyobakantorai/main/install.sh | bash -s -- --channel development --ref main
```

**Windows PowerShell**

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/exxrawrrr/nyobakantorai/main/install.ps1))) -Channel development -Ref main
```

AI agents can generate the equivalent plan first:

```bash
node scripts/ai-installer.mjs --channel development --ref main
```

### Contributor checkout

For a normal source checkout used by contributors:

```bash
git clone https://github.com/exxrawrrr/nyobakantorai.git
cd nyobakantorai
npm run smoke
```

Every successful normal installation writes `.nyobakantorai-install.json` containing channel, version/ref, exact source commit, integrity state, timestamp, and employee selection.

The installer never bundles maintainer API keys, provider credentials, billing state, sessions, memories, messaging tokens, or runtime databases. Configure your own provider separately, for example with `hermes setup --portal`.

## Hermes runtime configuration

Normally the installer and auto-discovery are enough. Advanced overrides:

```text
NYOBAKANTORAI_DISABLE_HERMES=0
NYOBAKANTORAI_HERMES_EXE=/absolute/path/to/hermes
NYOBAKANTORAI_HERMES_HOME=/absolute/path/to/hermes-data
NYOBAKANTORAI_BOARD=nyobakantorai
NYOBAKANTORAI_PORT=4322
NYOBAKANTORAI_WORKER_PORT=4333
```

On native Windows the office detects the upstream Hermes data location under `%LOCALAPPDATA%\hermes`; on POSIX it checks `~/.hermes`. Explicit environment overrides always win.

No secret is required by the repository itself.

## Public project layout

| Path | Purpose |
| --- | --- |
| `config/employees.json` | Canonical workforce registry — source of truth for employee identity/policy/routing |
| `config/capabilities.json` | Provider-neutral capability states, ads/tool contracts, and autonomy modes |
| `config/memory-policy.json` | M0–M4 profile/shared learning and canonical-skill promotion policy |
| `office/` | Visual local office, task UI, runtime cache, and read-only adapter |
| `agents/` | Registry-derived public SOUL/profile definitions |
| `hermes-profiles/` | Native Hermes profile distributions generated for the workforce |
| `skills/canonical/` | Reusable portable skills |
| `operations/taskctl/` | Blocked owner-controlled Hermes task intake |
| `operations/handoff/` | Manual handoff, receipts, and source-evidence gates |
| `operations/workflow/` | Deterministic routing preview and QA request flow |
| `operations/doctor/` | Read-only environment diagnostics |
| `packages/task-registry/` | Standalone evented task-registry prototype |
| `packages/runtime-adapter/` | Dependency-free read-only runtime adapter SDK |
| `docs/` | Architecture, approval model, threat model, privacy, demos, release docs, and adapter contracts |
| `scripts/` | Security, public-release, employee-pack, selection, and test automation |

## Capability endpoint

```http
GET /api/capabilities
```

Example contract:

```json
{
  "app": "nyobakantorai",
  "api": 1,
  "runtime_adapter_api": 1,
  "local_only": true,
  "dispatch": false,
  "runtime_adapter": "none",
  "evidence_gated_verification": true,
  "human_approval_gate": true,
  "approval_risk_classes": ["EXTERNAL_WRITE", "PAID_ACTION", "ACCOUNT_CHANGE", "DESTRUCTIVE"]
}
```

This endpoint is discovery metadata, not authorization.

## Upstreams and credits

- **Hermes Agent** — reference agent runtime: https://github.com/NousResearch/hermes-agent
- **Pixel Agents** — visual/interaction inspiration for representing active agents as workers in an office: https://github.com/pixel-agents-hq/pixel-agents

nyobakantorai does not vendor Hermes itself and is not presented as a fork of Pixel Agents. See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for the exact relationship and provenance notes.

## Safety model

nyobakantorai is designed around **least privilege and honest state**.

Skills are procedures, not permissions. A configured provider is not proof that inference happened. A task card is not an execution receipt. A named reviewer is not proof that an independent review happened. External writes require explicit scoped human approval. Runtime claims that cannot be reconciled degrade to UNKNOWN / NOT CONNECTED.

The office server binds to localhost and rejects cross-site mutation attempts. Credentials, runtime databases, logs, private paths, and personal workspace artifacts are excluded from the public release.

Run the full release gate before every release candidate:

```bash
npm run ready
```

## Development

```bash
npm run doctor
npm run audit
npm test
npm run demo
npm run demo:adapter
npm run smoke
npm run build
npm start
```

`npm run demo` executes a deterministic synthetic multi-agent flow without contacting a model or external service.

The CI workflow runs the same verification on Linux and Windows.

## Project status

**v0.5.1 is the current stable release.** The release artifact, public contract/API surfaces, and runtime-adapter layer are marked `stable`. Behavioral evidence remains `evaluated-case`; real-world workflow evidence remains `collecting` at 1/20 eligible cases; provider lifecycle remains `partial`. These states are intentionally independent.

v0.5 also carries an executable [complexity budget](config/complexity-budget.json): 12 required subsystems have explicit delete-test decisions. Current delete-test result is **11 KEEP / 1 MERGE**; Chat 19 executed that MERGE by folding the internal `deferred-evidence` module/tests into `release-claims` while preserving the historical v0.4 ledger and docs unchanged. See [Complexity Budget](docs/COMPLEXITY-BUDGET.md).

See:

- [ROADMAP.md](ROADMAP.md)
- [office/docs/ARCHITECTURE.md](office/docs/ARCHITECTURE.md)
- [docs/HERMES-FIRST-SETUP.md](docs/HERMES-FIRST-SETUP.md)
- [docs/EMPLOYEE-ARCHITECTURE.md](docs/EMPLOYEE-ARCHITECTURE.md)
- [docs/EMPLOYEE-PACKS.md](docs/EMPLOYEE-PACKS.md)
- [docs/PERSONALITY-CONTRACT.md](docs/PERSONALITY-CONTRACT.md)
- [docs/MEMORY-LEARNING.md](docs/MEMORY-LEARNING.md)
- [docs/EXECUTION-RECEIPTS.md](docs/EXECUTION-RECEIPTS.md)
- [docs/CAPABILITY-MODEL.md](docs/CAPABILITY-MODEL.md)
- [docs/AUTONOMY-MODES.md](docs/AUTONOMY-MODES.md)
- [docs/ADS-WORKERS.md](docs/ADS-WORKERS.md)
- [docs/TELEGRAM-OFFICE.md](docs/TELEGRAM-OFFICE.md)
- [docs/V0.3-UPGRADE.md](docs/V0.3-UPGRADE.md)
- [docs/ADDING-EMPLOYEE.md](docs/ADDING-EMPLOYEE.md)
- [docs/RUNTIME-ADAPTER-SPEC.md](docs/RUNTIME-ADAPTER-SPEC.md)
- [docs/APPROVAL-MODEL.md](docs/APPROVAL-MODEL.md)
- [docs/DEMO.md](docs/DEMO.md)
- [docs/V0.5-RELEASE-READINESS.md](docs/V0.5-RELEASE-READINESS.md)
- [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md)
- [docs/PUBLICATION-RUNBOOK.md](docs/PUBLICATION-RUNBOOK.md)
- [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md)
- [docs/PRIVACY.md](docs/PRIVACY.md)
- [SECURITY.md](SECURITY.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)

MIT licensed.

---

**A visible agent is not the same thing as a verified worker.**

---

# Owner's notes / Catatan buat gue sendiri

> **Catatan buat gue sendiri.**
>
> Iki kantor AI.
>
> Tapi kalau suatu hari isinya cuma avatar jalan-jalan, status "working", terus nggak ada bukti kerja apa pun:
>
> **berarti gue bikin The Sims, bukan agent system.**

<p align="center">
  <img src="https://raw.githubusercontent.com/exxrawrrr/exxrawrrr/main/assets/readme-memes/hello-it.gif" width="315" alt="hello IT reaction gif" />
</p>

## Ngene loh.

Gue pengen punya **kantor AI lokal**.

Bukan satu chatbot yang disuruh jadi semuanya.

Tapi beberapa role yang jelas:

- ada yang koordinasi;
- ada yang mikir angka;
- ada yang engineering;
- ada yang research;
- ada yang creative;
- ada yang tugasnya justru nyari kesalahan semuanya.

Terus gue pengen mereka kelihatan di satu visual office biar gampang ngerti:

> **sopo lagi ngapain, tugasnya apa, statusnya apa, dan buktinya mana.**

![nyobakantorai office overview](docs/assets/office-overview.png)

Masalahnya, begitu bikin multi-agent, godaannya langsung muncul:

```text
avatar bergerak
+
nama agent keren
+
status WORKING
=
wah autonomous office
```

Ora.

Status bergerak bukan evidence.

Model configured bukan evidence.

Agent bilang `done` juga belum tentu evidence.

<p align="center">
  <img src="https://raw.githubusercontent.com/exxrawrrr/exxrawrrr/main/assets/readme-memes/monkas-gif.gif" width="280" alt="monkas reaction gif" />
</p>

---

## Yang gue nggak mau dari project ini

Gue nggak mau bikin sistem yang kelihatannya hidup tapi aslinya penuh simulasi.

Contoh paling gampang:

```text
TASK: publish something
STATUS: COMPLETED
REVIEWER: Siti
RESULT: VERIFIED
```

Terus ditanya:

> receipt mana?

Jawabannya:

> "ya... statusnya kan VERIFIED."

**Lah.**

Makanya di sini state harus punya arti.

Kalau bilang verified, harus ada basisnya.

Kalau adapter nggak tahu, bilang `UNKNOWN`.

Kalau runtime nggak nyambung, bilang `NOT CONNECTED`.

Kalau external write belum diapprove manusia, ya jangan diam-diam jalan.

Simple secara konsep.

Implementasinya tentu bikin rambut rontok.

<p align="center">
  <img src="https://raw.githubusercontent.com/exxrawrrr/exxrawrrr/main/assets/readme-memes/apu-helper.jpg" width="300" alt="helper reaction meme" />
</p>

---

## Human tetap pegang setir

Ini bagian yang sengaja gue keras kepala soal ini.

Agent boleh bantu.

Agent boleh prepare.

Agent boleh research.

Agent boleh bikin draft.

Agent boleh routing kerjaan.

Tapi untuk kelas tindakan seperti:

```text
EXTERNAL_WRITE
PAID_ACTION
ACCOUNT_CHANGE
DESTRUCTIVE
```

harus ada approval manusia yang jelas.

Karena:

> **"AI-nya yakin" bukan permission model.**

<p align="center">
  <img src="https://raw.githubusercontent.com/exxrawrrr/exxrawrrr/main/assets/readme-memes/two-buttons-sweating.jpg" width="300" alt="two buttons decision meme" />
</p>

---

## Meet the office

v0.3 membawa **16 specialized AI employees**, bukan enam kostum buat satu chatbot.

Enam karakter awal tetap memakai original owner-authored sprites. Sepuluh worker baru sudah punya role, skills, tool policy, routing, approval, verification, dan installable Hermes profile yang nyata—tetapi visualnya sengaja memakai placeholder `PENDING ORIGINAL ART` sampai artwork original tersedia.

![Meet the nyobakantorai office](docs/assets/meet-the-office.gif)

| | | |
| --- | --- | --- |
| <img src="office/src/assets/generated/characters/praroro/idle.png" width="82" alt="Praroro"><br>**Praroro**<br><sub>COO / Chief of Staff</sub> | <img src="office/src/assets/generated/characters/paijo/idle.png" width="82" alt="Paijo"><br>**Paijo**<br><sub>Quant / Growth / Finance</sub> | <img src="office/src/assets/generated/characters/subagjo/idle.png" width="82" alt="Subagjo"><br>**Subagjo**<br><sub>Engineering / Operations</sub> |
| <img src="office/src/assets/generated/characters/alex/idle.png" width="82" alt="Alex"><br>**Alex**<br><sub>Strategy / Research</sub> | <img src="office/src/assets/generated/characters/sumiati/idle.png" width="82" alt="Sumiati"><br>**Sumiati**<br><sub>Creative / Communications</sub> | <img src="office/src/assets/generated/characters/siti/idle.png" width="82" alt="Siti"><br>**Siti**<br><sub>QA / Compliance / Knowledge</sub> |

Visual di atas pakai **sprite karakter asli yang gue buat untuk kantor ini**. Yang disimpan di repo cuma sprite final 128×128; source sheet mentah dan path privat tetap stay lokal.

Kalau semua agent selalu sepakat:

gue malah curiga.

QA yang tugasnya cuma bilang:

> "looks good!"

itu bukan QA.

Itu teman nongkrong.

<p align="center">
  <img src="https://raw.githubusercontent.com/exxrawrrr/exxrawrrr/main/assets/readme-memes/apu-candidate.png" width="280" alt="candidate reaction meme" />
</p>

---

## Local-first bukan berarti anti-internet

Maksudnya bukan agent harus hidup di gua tanpa koneksi.

Maksudnya:

**core office jangan bergantung pada cloud hanya supaya bisa berdiri.**

UI lokal.

State lokal.

Runtime adapter optional.

Hermes optional.

Kalau provider lagi mati atau saldo API habis, kantor nggak boleh berubah jadi batu nisan digital.

<p align="center">
  <img src="https://raw.githubusercontent.com/exxrawrrr/exxrawrrr/main/assets/readme-memes/pepe-typing.gif" width="285" alt="typing reaction gif" />
</p>

Tanpa Hermes pun UI tetap usable di offline mode.

Yang nggak diketahui harus gagal secara jujur.

Bukan dikarang biar dashboard kelihatan penuh.

<p align="center">
  <img src="https://raw.githubusercontent.com/exxrawrrr/exxrawrrr/main/assets/readme-memes/we-dont-do-that-here.jpg" width="300" alt="we dont do that here meme" />
</p>

---

## Prinsip yang jangan hilang walau UI nanti makin cakep

```text
human intent
    ↓
scoped task
    ↓
agent role / runtime
    ↓
work product
    ↓
evidence + provenance
    ↓
independent verification
```

Kalau nanti ada fitur agent otomatis yang keren banget tapi ngerusak alur itu:

fiturnya yang dipertanyakan.

Bukan prinsipnya.

---

## "VERIFIED is not a vibe"

Ini mungkin kalimat paling penting di repo ini.

Gue pengen state machine yang nggak gampang dibohongi oleh optimisme.

```text
configured ≠ connected
connected ≠ executed
executed ≠ succeeded
succeeded ≠ verified
```

Dan:

```text
task card ≠ execution receipt
named reviewer ≠ independent review
AI answer ≠ evidence
```

<p align="center">
  <img src="https://raw.githubusercontent.com/exxrawrrr/exxrawrrr/main/assets/readme-memes/spiderman-pointing.jpg" width="305" alt="spiderman pointing meme" />
</p>

Kalau suatu hari sistemnya jalan tapi nggak ada yang ngerti kenapa:

itu belum kemenangan.

---

## Posisi sekarang — 1 Oktober 2026

v0.5.1 akhirnya benar-benar publish.

Yang bikin gue lega bukan angka versinya.

Yang lebih penting: release-nya bisa dicek dari luar repo. Tag-nya menunjuk source commit yang jelas, artifact punya checksum, installer bisa dites ulang dari release yang sudah dipublish, dan kalau ada sesuatu yang belum terbukti sistemnya masih punya tempat buat bilang **belum**.

Itu terdengar sederhana, tapi justru bagian itu yang paling lama gue kejar.

Gue nggak mau repo ini menang karena README-nya terdengar besar. Gue juga nggak mau merendahkan kerja yang memang sudah selesai. Jadi posisi nyatanya sekarang:

- release artifact, contract/API, dan runtime-adapter layer sudah berada di state `stable`;
- bounded Hermes + Codex reference case sudah punya portability evidence yang lolos verifier;
- 16 employee profiles, pack pipeline, approval model, receipts, evidence model, dan installer sudah benar-benar ada di repo;
- real-world workflow evidence masih **1/20** dan statusnya tetap `collecting`;
- provider lifecycle masih `partial`;
- sebagian visual worker masih nunggu original art;
- beberapa integrasi nyata tetap bergantung pada setup dan akun milik user sendiri.

Jadi iya, proyeknya sudah jauh lebih nyata dibanding waktu awal gue cuma pengen lihat “kantor AI” di layar.

Tapi belum selesai.

Dan menurut gue justru bagus kalau README ini masih bisa bilang itu tanpa malu-malu dan tanpa jualan mimpi.

<p align="center">
  <img src="https://raw.githubusercontent.com/exxrawrrr/exxrawrrr/main/assets/readme-memes/pepe-clap.gif" width="275" alt="pepe clap gif" />
</p>

## Pesan buat gue nanti

Kalau project ini suatu hari sudah bisa dispatch kerjaan ke banyak runtime:

ojo kesusu bangga.

Cek dulu:

> **bisa nggak gue tahu persis siapa melakukan apa, pakai tool apa, berdasarkan input apa, menghasilkan apa, dan siapa yang verify?**

Kalau jawabannya nggak:

berarti kantornya tambah ramai.

Belum tentu tambah pintar.

**Oke. Balik kerja.**
