# nyobakantorai

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

## Current state

Release stable terbaru adalah **v0.5.1**. Tag ini menunjuk exact source commit `3004220522fee1971453f63bb50e6f9ed1264687`; tagged release-gate `36812543303` berhasil membangun dan memverifikasi immutable install assets sebelum GitHub Release dipublish. Tag `v0.5.0` tetap dipertahankan immutable sebagai failed publication attempt dan tidak pernah dipoles menjadi release sukses.

**v0.5.1 is published and stable as an artifact.** Exact final-main verify #578 passed, manual release-gate run `36811702004` passed, fresh-clone `v0.5:readiness:require-ready` exited 0, tagged release-gate `36812543303` passed, and the official release published 25 assets. A post-release isolated install reproduced the exact source commit and verified core artifact checksum. Canonical Hermes+Codex Siti portability remains scoped to the bounded reference case; real-world/provider evidence limits remain unchanged. Sumber permanen: [v0.5 Release Readiness](docs/V0.5-RELEASE-READINESS.md) + [machine-readable ledger](config/v0.5-release-readiness.json).

**Snapshot maturity v0.5.1 published release:**

| Dimension | State |
| --- | --- |
| Artifact | `stable` |
| Contract/API | `stable` |
| Runtime adapter | `stable` |
| Behavioral evidence | `evaluated-case` |
| Real-world workflow | `collecting` |
| Provider lifecycle | `partial` |

Ini sengaja multidimensi: **stable artifact ≠ stable behavior**. Controlled live cases tidak otomatis berarti repeated behavior; real-task 1/20 juga tetap `collecting`. Sumber mesin: [evidence classification](config/evidence-classification.json) dan [maturity model](config/maturity-model.json); penjelasan: [Evidence Classification](docs/EVIDENCE-CLASSIFICATION.md) dan [Stability Model](docs/STABILITY-MODEL.md).


v0.4 Modular Workforce sudah mencapai **stable-promotion scope**. Pada 30 September 2026 owner secara eksplisit menerima enam evidence gap yang masih terbuka sebagai deferred scope untuk v0.4.0; status `UNPROVEN`, `NOT_RUN`, dan `COLLECTING` tetap dipertahankan apa adanya dan tidak dipoles menjadi bukti selesai.

Yang sudah ada di kandidat v0.4 antara lain:

- 16 specialized Hermes employee profiles dari satu canonical registry;
- standalone one/subset/preset/all employee packs;
- selective installer + reproducible pack/checksum pipeline;
- signed Ed25519 execution receipts + evidence-verifier integration;
- evidence-gated task state + explicit human approval gate;
- application-level runtime permission policy (bukan OS/container isolation);
- M0–M4 memory/learning policy + deterministic cross-profile isolation;
- Fikri L0/L1/L2 context compiler;
- controlled live-model Fikri evaluation;
- provider evaluation contracts + Playwright MCP controlled-live candidate evidence;
- anti-synthetic real-task collection gate;
- local hash-chained Real Task Recorder with independent verification + export;
- side-effect-free Unified Provider Doctor for user-owned Hermes/Codex/Gemini/Copilot/Cognee/Browser Use/Playwright setup;
- isolated Browser Use self-service six-case runner with disposable loopback target, temporary browser profile, server-side mutation/auth evidence, and no automatic install/login;
- isolated Cognee self-service eight-case memory runner with random run-owned datasets, secret pre-write rejection, scoped deletion, cleanup verification, and remote opt-in;
- cross-harness self-service parity runner for Hermes/Codex/Gemini/Copilot with one disposable skill, exact protected-atom contract, temporary workspaces, and no auto-install/login;
- isolated release matrices for one worker, arbitrary subset, full workforce, and full upgrade/uninstall/reinstall lifecycle with user-state preservation and byte-integrity checks;
- Linux + Windows + minimum-version CI.

Yang **belum** boleh dianggap proven/stable:

- canonical live cross-harness behavioral parity across real installed harnesses;
- canonical live Cognee/Hermes provider-lifecycle evaluation;
- Browser Use side of the browser comparison;
- real-task baseline, saat ini baru **1/20 eligible cases**;
- final real clean-machine Hermes lifecycle coverage on intended release platforms;
- live ads provider adapters;
- finished original art untuk 10 worker baru;
- complete office/UI storage migration.

Stable promotion **AUTHORIZED WITH ACCEPTED DEFERRALS**. Tag stabil hanya boleh dibuat setelah commit yang dipromosikan ke `main` lulus verify lintas platform dan manual release-gate. Lihat [docs/V0.4-RELEASE-DECISION.md](docs/V0.4-RELEASE-DECISION.md), [docs/V0.4-REVIEW-MAP.md](docs/V0.4-REVIEW-MAP.md), dan [ROADMAP.md](ROADMAP.md).

Self-service evidence/setup surfaces: [Real Task Recorder](docs/REAL-TASK-RECORDER.md), [Real-Task Baseline Collection](docs/REAL-TASK-BASELINE.md), [Unified Provider Doctor](docs/PROVIDER-DOCTOR.md), [Browser Use Self-Test](docs/BROWSER-SELF-TEST.md), [Cognee Memory Self-Test](docs/COGNEE-SELF-TEST.md), dan [Cross-Harness Self-Test](docs/CROSS-HARNESS-SELF-TEST.md).

---

## Pesan buat gue nanti

Kalau project ini suatu hari sudah bisa dispatch kerjaan ke banyak runtime:

ojo kesusu bangga.

Cek dulu:

> **bisa nggak gue tahu persis siapa melakukan apa, pakai tool apa, berdasarkan input apa, menghasilkan apa, dan siapa yang verify?**

Kalau jawabannya nggak:

berarti kantornya tambah ramai.

Belum tentu tambah pintar.

<p align="center">
  <img src="https://raw.githubusercontent.com/exxrawrrr/exxrawrrr/main/assets/readme-memes/pepe-clap.gif" width="275" alt="pepe clap gif" />
</p>

**Oke. Balik kerja.**

---

<br/>

# For everyone else

> The section above is intentionally written as the owner's working note. This section is the technical project overview.

## nyobakantorai

**nyobakantorai is a local-first, human-governed multi-agent office that treats evidence as a first-class feature.**

It is an experimental visual workspace for coordinating AI-agent roles without pretending that a configured model, a moving avatar, or a task label proves that work actually happened.

The core model is:

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

The default build is intentionally conservative: localhost-only, no autonomous dispatch endpoint, no bundled credentials, no production-write capability, and no hidden provider calls.

## Highlights

- **16 specialized Hermes employees** driven by one canonical registry, with distinct dialogue fingerprints, roles, habits, skills, toolset preferences, routing, approval, and verification policy.
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

## Workforce baseline (v0.3, extended by the v0.4 candidate)

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

> **Stable means immutable here.** Starting with v0.5.0, the recommended installer resolves a tagged GitHub release, downloads a core release artifact, verifies `install-manifest.json` + SHA-256 checksums, and only then unpacks it. Stable mode never falls back to mutable `main`.

### Hermes-first — recommended stable path

Hermes remains the reference runtime. The installer can reuse an existing Hermes installation or, only when you explicitly pass `WithHermes` / `--with-hermes`, invoke the official upstream installer.

**Windows PowerShell**

```powershell
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.ps1))) -WithHermes -Start
```

**Linux / macOS / WSL2**

```bash
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.sh | bash -s -- --with-hermes --start
```

The latest-release URL resolves the current stable release. The installer then verifies the immutable release artifact before installation.

To pin an exact release, download that release's installer asset and pass the same version explicitly:

```bash
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/download/v0.5.1/install.sh | bash -s -- --version v0.5.1 --with-hermes
```

```powershell
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/download/v0.5.1/install.ps1))) -Version v0.5.1 -WithHermes
```

### Install only part of the office

The selector remains independent from the stable source channel.

Windows:

```powershell
# one worker
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.ps1))) -WithHermes -Employees "siti"

# arbitrary subset
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.ps1))) -WithHermes -Employees "praroro,siti"

# preset
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.ps1))) -WithHermes -Employees "growth"
```

Linux / macOS / WSL2:

```bash
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.sh | bash -s -- --with-hermes --employees siti
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.sh | bash -s -- --with-hermes --employees praroro,siti
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.sh | bash -s -- --with-hermes --employees growth
```

Presets: `leadership`, `engineering`, `growth`, `research`, `operations`, `creative-community`, and `full`.

Tagged releases also publish standalone employee ZIPs with their own checksums. See [docs/EMPLOYEE-PACKS.md](docs/EMPLOYEE-PACKS.md).

Every successful install writes `.nyobakantorai-install.json` with the install channel, version/ref, exact source commit, stable artifact checksum when applicable, integrity state, timestamp, and selected employees. See [docs/INSTALL-INTEGRITY.md](docs/INSTALL-INTEGRITY.md).

It never copies the author's API keys, provider credentials, billing configuration, sessions, memories, messaging tokens, or runtime databases. Configure your own model/provider after installation with:

```bash
hermes setup --portal
```

### Mutable development path — explicit opt-in only

`main` is no longer the stable default. Contributors who intentionally want mutable source must opt in.

POSIX:

```bash
curl -fsSL https://raw.githubusercontent.com/exxrawrrr/nyobakantorai/main/install.sh | bash -s -- --channel development --ref main
```

PowerShell:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/exxrawrrr/nyobakantorai/main/install.ps1))) -Channel development -Ref main
```

A stable integrity failure does **not** downgrade to this path.

### Core-only / contributor path

The office can run without Hermes. Runtime requires **Node.js 20+**. Python 3.10+ and PyYAML are needed only for contributor/release utilities.

For a source checkout used for development:

```bash
git clone https://github.com/exxrawrrr/nyobakantorai.git
cd nyobakantorai

node scripts/preflight.mjs --runtime
npm run smoke
npm start
```

Open `http://127.0.0.1:4322`.

For contributor/release verification:

```bash
python -m pip install -r requirements-dev.txt
npm run ready
```

The root package keeps `"private": true` intentionally to prevent accidental npm publication; it does **not** make the GitHub repository private.

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

**v0.5.1 is the current stable release.** Its tagged immutable install assets were verified and published successfully; behavioral evidence remains `evaluated-case`, real-world workflow remains `collecting`, and provider lifecycle remains `partial`.

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
