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
```

Default output:

```text
dist/employees/<employee-id>/
```

Each directory is a standalone Hermes distribution plus pack metadata:

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
