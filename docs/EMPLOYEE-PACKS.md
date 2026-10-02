# Standalone employee packs

nyobakantorai can export and install one employee, an arbitrary subset, a preset team, or the full workforce.

The canonical source of truth remains `config/employees.json` plus generated Hermes profiles. Employee packs are release artifacts, **not** a second editable registry.

## Select employees during install

### Windows PowerShell

Full workforce:

```powershell
.\install.ps1 -WithHermes -Employees "all"
```

One worker:

```powershell
.\install.ps1 -WithHermes -Employees "siti"
```

Arbitrary subset:

```powershell
.\install.ps1 -WithHermes -Employees "praroro,siti"
```

Preset:

```powershell
.\install.ps1 -WithHermes -Employees "growth"
```

### Linux / macOS / WSL

```bash
./install.sh --with-hermes --employees siti
./install.sh --with-hermes --employees praroro,siti
./install.sh --with-hermes --employees growth
./install.sh --with-hermes --employees all
```

Available presets:

| Preset | Employees |
| --- | --- |
| `leadership` | Praroro, Siti, Fikri |
| `engineering` | Subagjo, Siti, Bimo |
| `growth` | Paijo, Maya, Gugun, Ratri, Nara |
| `research` | Alex, Siti, Fikri |
| `operations` | Praroro, Dina, Bambang, Tari |
| `creative-community` | Alex, Sumiati, Caca |
| `full` / `all` | all employees |

Selection is resolved against the canonical workforce order. Unknown employees/presets fail closed.

An upgrade touches only selected profiles. Unselected existing Hermes profiles are left alone.

## Build packs locally

```bash
npm run employee:pack -- --employee=siti
npm run employee:pack -- --employees=praroro,siti
npm run employee:pack -- --employees=growth
npm run employee:pack -- --employees=all

# rebuild selected packs twice in temp directories and compare checksum manifests
npm run employee:pack -- --employees=siti --check

# full 16-worker determinism gate
npm run employee:pack:check
```

Default output:

```text
dist/employees/<employee-id>/
```

Each directory is a standalone Hermes distribution plus pack metadata.

CHAT 21 applies owner-reviewed Skills Store attachments as a **procedural overlay** during pack build. The canonical employee registry remains the baseline authority source; attached skills do not modify connector grants, capability scope, toolsets, approval policy, or external-account access.

The pack manifest records both `baseline_skills` and effective `skills`, plus `skill_store_attachments` with immutable install/attachment refs and `authority_effect: NONE`.



```text
SOUL.md
profile.yaml
config.yaml
distribution.yaml
skills/
employee-pack.json
README.md
checksums.json
integrations/
  optional-integrations.json
provenance/
  SOURCES.json
```

From a pack directory:

```bash
hermes profile install . -y
```

## Release downloads

The tagged release workflow builds all 16 standalone employee packs.

It produces:

```text
nyobakantorai-praroro.zip
nyobakantorai-paijo.zip
...
nyobakantorai-caca.zip
nyobakantorai-full-workforce.zip
SHA256SUMS.txt
```

The ZIPs are uploaded as a workflow artifact and, for `v*` tags, attached to the GitHub Release.

Users who want two workers can download/install two individual packs. They do not need the full office package.

## What a pack does not contain

A pack does **not** contain:

- API keys;
- provider tokens;
- account credentials;
- billing state;
- runtime sessions;
- user memories;
- auth databases;
- external-account authorization.

Optional integrations in `integrations/optional-integrations.json` are metadata only. `NOT_INSTALLED` and `REFERENCE_ONLY` mean exactly that.

Installing Siti does not automatically connect Playwright. Installing Maya does not automatically connect Meta Ads.

## Checksums

Each pack contains `checksums.json` with SHA-256 hashes for its generated files.

The release workflow also emits `SHA256SUMS.txt` for the ZIP files.

`verifyEmployeePack()` is exercised by tests, including a tamper test that must fail after a bundled artifact is modified.

## Personality

A standalone employee keeps the same canonical `dialogue_profile` as the office workforce. Installing one worker does not flatten the employee into a generic assistant.

Personality is a style/interaction contract, not an authority boundary. Approval, evidence, safety, and verification policies always win.


## Reproducible release ZIPs

Folder-level pack determinism is checked before tagged release packaging.

The release workflow then normalizes file timestamps to a fixed ZIP-safe time, sorts file order, removes nonessential ZIP metadata with `zip -X`, and sorts `SHA256SUMS.txt`.

This is intended to make ZIP bytes reproducible from the same tagged source and release workflow environment, instead of letting archive timestamps/order change the checksum.

The release job publishes:

- one ZIP per employee;
- one `nyobakantorai-full-workforce.zip`;
- `SHA256SUMS.txt`;
- the release manifest.

An arbitrary two-worker setup can still use the two individual employee ZIPs; no unrelated employee pack is required.


## Removing selected Hermes profiles

Hermes supports profile deletion, but deletion is destructive: profile config, memories, sessions, and skills are removed.

nyobakantorai therefore keeps removal separate from installation.

Preview only:

```bash
npm run hermes:remove -- --employees=siti
npm run hermes:remove -- --employees=praroro,siti
```

Actual deletion requires an explicit destructive-data acknowledgement:

```bash
npm run hermes:remove -- --employees=siti --confirm-delete-user-state
```

The removal script:

- resolves only the requested employee subset;
- does not touch unselected profiles;
- treats already-absent selected profiles as idempotent success;
- verifies every selected profile is absent after deletion;
- fails closed if any selected profile still exists.

This is intentionally not an automatic uninstall step inside the normal installer.


## Skills Store upgrade overlay

The current 16 employees receive one reviewed capability-loop skill attachment each from `config/skill-store-attachments.json`.

Pack generation copies the corresponding canonical skill into the standalone pack and records the attachment provenance. This is a procedural upgrade only.

Installing a pack still does **not** connect Playwright, Google Ads, Meta Ads, or any other provider, and it does not create or widen resource grants.

See `docs/V0.7-SKILLS-STORE.md`.
