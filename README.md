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

Enam public example employee ini bukan nama pajangan.

Mereka punya role guidance, reusable skills, dan visual state seperti `idle`, `walk`, `think`, `work`, `role`, dan `seated`.

![Meet the nyobakantorai office](docs/assets/meet-the-office.gif)

| | | |
| --- | --- | --- |
| <img src="office/src/assets/generated/characters/praroro/idle.svg" width="82" alt="Praroro"><br>**Praroro**<br><sub>COO / Chief of Staff</sub> | <img src="office/src/assets/generated/characters/paijo/idle.svg" width="82" alt="Paijo"><br>**Paijo**<br><sub>Quant / Growth / Finance</sub> | <img src="office/src/assets/generated/characters/subagjo/idle.svg" width="82" alt="Subagjo"><br>**Subagjo**<br><sub>Engineering / Operations</sub> |
| <img src="office/src/assets/generated/characters/alex/idle.svg" width="82" alt="Alex"><br>**Alex**<br><sub>Strategy / Research</sub> | <img src="office/src/assets/generated/characters/sumiati/idle.svg" width="82" alt="Sumiati"><br>**Sumiati**<br><sub>Creative / Communications</sub> | <img src="office/src/assets/generated/characters/siti/idle.svg" width="82" alt="Siti"><br>**Siti**<br><sub>QA / Compliance / Knowledge</sub> |

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

Project sekarang berada di **v0.2 public-preview**.

Yang sudah ada termasuk:

- localhost-only visual office;
- six agent personas;
- 16 reusable skills;
- evidence-gated task state;
- explicit human approval gate;
- manual handoff + receipt protocol;
- read-only optional runtime adapter;
- portable diagnostics;
- public-release guardrails;
- Linux + Windows CI;
- deterministic demo;
- machine-readable capability contract.

Fokus berikutnya masih di adapter boundary, execution receipts, capability negotiation, dan human-governed orchestration.

Roadmap canonical ada di [ROADMAP.md](ROADMAP.md).

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

- **6 example agent personas** for coordination, metrics, engineering, strategy, creative work, and independent QA.
- **16 reusable skills** covering task truth, tool safety, approval gates, provenance, research, growth, engineering, creative work, and QA.
- **Evidence-gated task state** where VERIFIED requires independent evidence.
- **Human approval gate** for external writes, paid actions, account changes, and destructive actions.
- **Read-only runtime adapter** that treats Hermes as optional and fails closed when runtime state is unavailable or stale.
- **Manual handoff + receipt protocol** for provenance-aware work across surfaces.
- **Portable diagnostics** that check expected safety boundaries without printing secrets.
- **Machine-readable capabilities** through `GET /api/capabilities`.
- **Public-release guardrails** for tests, builds, private-path leakage, sensitive filenames, and credential-shaped strings.
- **Zero npm runtime dependencies** for the main office server.

## Quick start

Requirements:

- Node.js 20+
- Python 3.10+
- PyYAML for Python utilities/tests

```bash
git clone https://github.com/exxrawrrr/nyobakantorai.git
cd nyobakantorai

python -m pip install -r requirements-dev.txt
npm run verify
npm start
```

Open:

```text
http://127.0.0.1:4322
```

Windows users can also run:

```text
office/START-NYOBAKANTORAI.bat
```

Hermes is optional. Without it, the UI remains usable in fast offline mode.

## Optional Hermes adapter

```text
NYOBAKANTORAI_HERMES_EXE=/absolute/path/to/hermes
NYOBAKANTORAI_HERMES_HOME=/absolute/path/to/.hermes
NYOBAKANTORAI_BOARD=nyobakantorai
NYOBAKANTORAI_PORT=4322
NYOBAKANTORAI_WORKER_PORT=4333
```

No secret is required by the repository itself.

## Public project layout

| Path | Purpose |
| --- | --- |
| `office/` | Visual local office, task UI, runtime cache, and read-only adapter |
| `agents/` | Six example public SOUL/profile definitions |
| `skills/hermes-custom/` | Reusable portable skills |
| `operations/taskctl/` | Blocked owner-controlled Hermes task intake |
| `operations/handoff/` | Manual handoff, receipts, and source-evidence gates |
| `operations/workflow/` | Deterministic routing preview and QA request flow |
| `operations/doctor/` | Read-only environment diagnostics |
| `packages/task-registry/` | Standalone evented task-registry prototype |
| `packages/runtime-adapter/` | Dependency-free read-only runtime adapter SDK |
| `docs/` | Architecture, approval model, threat model, privacy, demos, release docs, and adapter contracts |
| `scripts/` | Security, public-release, and test automation |

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

## Safety model

nyobakantorai is designed around **least privilege and honest state**.

Skills are procedures, not permissions. A configured provider is not proof that inference happened. A task card is not an execution receipt. A named reviewer is not proof that an independent review happened. External writes require explicit scoped human approval. Runtime claims that cannot be reconciled degrade to UNKNOWN / NOT CONNECTED.

The office server binds to localhost and rejects cross-site mutation attempts. Credentials, runtime databases, logs, private paths, and personal workspace artifacts are excluded from the public release.

Run the full release gate before every push:

```bash
npm run verify
```

## Development

```bash
npm run audit
npm test
npm run demo
npm run demo:adapter
npm run build
npm start
```

`npm run demo` executes a deterministic synthetic multi-agent flow without contacting a model or external service.

The CI workflow runs the same verification on Linux and Windows.

## Project status

**v0.2 public-preview**

See:

- [ROADMAP.md](ROADMAP.md)
- [office/docs/ARCHITECTURE.md](office/docs/ARCHITECTURE.md)
- [docs/RUNTIME-ADAPTER-SPEC.md](docs/RUNTIME-ADAPTER-SPEC.md)
- [docs/APPROVAL-MODEL.md](docs/APPROVAL-MODEL.md)
- [docs/DEMO.md](docs/DEMO.md)
- [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md)
- [docs/PUBLICATION-RUNBOOK.md](docs/PUBLICATION-RUNBOOK.md)
- [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md)
- [docs/PRIVACY.md](docs/PRIVACY.md)
- [SECURITY.md](SECURITY.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)

MIT licensed.

---

**A visible agent is not the same thing as a verified worker.**
