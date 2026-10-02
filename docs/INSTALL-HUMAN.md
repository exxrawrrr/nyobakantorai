# Install nyobakantorai — Human Guide

This is the recommended installation path for people.

## Which version will I get?

The **stable** installer resolves the latest published GitHub Release and installs only its immutable release asset after SHA-256 and install-manifest verification.

The repository can contain newer roadmap work on `main`, including completed CHAT 30 v1.0 convergence code. Unreleased candidates are **not** silently treated as stable. At the current repository state, the published stable line remains **v0.5.1**.

## Windows — recommended

```powershell
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.ps1))) -WithHermes -Start
```

## Linux / macOS / WSL2 — recommended

```bash
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.sh | bash -s -- --with-hermes --start
```

## Install selected AI employees

Windows:

```powershell
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.ps1))) -WithHermes -Employees "siti"
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.ps1))) -WithHermes -Employees "praroro,siti"
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.ps1))) -WithHermes -Employees "growth"
```

POSIX:

```bash
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.sh | bash -s -- --with-hermes --employees siti
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.sh | bash -s -- --with-hermes --employees praroro,siti
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.sh | bash -s -- --with-hermes --employees growth
```

Presets: `leadership`, `engineering`, `growth`, `research`, `operations`, `creative-community`, and `full`.

## Pin exactly v0.5.1

```powershell
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/download/v0.5.1/install.ps1))) -Version v0.5.1 -WithHermes
```

```bash
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/download/v0.5.1/install.sh | bash -s -- --version v0.5.1 --with-hermes
```

## What the installer does

1. Resolves an immutable stable release.
2. Downloads its manifest, checksum list, and core artifact.
3. Verifies source/tag metadata, byte size, and SHA-256.
4. Refuses fallback to mutable `main` when integrity verification fails.
5. Runs runtime preflight.
6. Installs/upgrades selected Hermes employee profiles when Hermes is present.
7. Writes `.nyobakantorai-install.json` with installation provenance.
8. Optionally starts the localhost office.

## What it does not do

It does **not** copy maintainer API keys, credentials, sessions, memories, provider billing configuration, messaging tokens, browser profiles, or runtime databases.

Configure your own provider when needed:

```bash
hermes setup --portal
```

## Development install

Use this only when you intentionally want mutable source:

```bash
curl -fsSL https://raw.githubusercontent.com/exxrawrrr/nyobakantorai/main/install.sh | bash -s -- --channel development --ref main
```

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/exxrawrrr/nyobakantorai/main/install.ps1))) -Channel development -Ref main
```

Stable integrity failure never downgrades automatically to this path.
