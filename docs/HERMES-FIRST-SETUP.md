# Hermes-first setup

This is the recommended path when you want nyobakantorai to behave like a real Hermes-backed office instead of a standalone visual demo.

## What gets installed

The nyobakantorai installer can:

1. install or reuse the upstream **Hermes Agent** CLI;
2. download a tagged nyobakantorai core release and verify its manifest + SHA-256 before unpacking;
3. validate the runtime prerequisites;
4. install or safely upgrade the native Hermes profile distributions from `config/employees.json`;
5. install the canonical role skills and fresh-install toolset defaults assigned to each employee;
6. create/switch the Hermes Kanban board named `nyobakantorai`;
7. optionally start the localhost office.

It does **not** copy the author’s credentials, provider configuration, API keys, billing settings, sessions, memories, messaging tokens, or private runtime databases.

## Windows — fastest path

Open PowerShell and run:

```powershell
& ([scriptblock]::Create((irm https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.ps1))) -WithHermes -Start
```

The `-WithHermes` flag is explicit permission to invoke the official Hermes upstream installer if Hermes is not already installed. If you prefer to inspect scripts before execution, download `install.ps1` and the Hermes upstream installer first, review them, then run locally.

## Linux / macOS / WSL2 — fastest path

```bash
curl -fsSL https://github.com/exxrawrrr/nyobakantorai/releases/latest/download/install.sh | bash -s -- --with-hermes --start
```

## Install only selected employees

The default remains the full workforce. You can now select one employee, an arbitrary subset, or a preset.

Windows:

```powershell
# one
.\install.ps1 -WithHermes -Employees "siti"

# arbitrary subset
.\install.ps1 -WithHermes -Employees "praroro,siti"

# preset
.\install.ps1 -WithHermes -Employees "engineering"
```

POSIX:

```bash
./install.sh --with-hermes --employees siti
./install.sh --with-hermes --employees praroro,siti
./install.sh --with-hermes --employees engineering
```

The same selector can be passed directly to bootstrap:

```bash
node scripts/hermes-bootstrap.mjs --upgrade --employees=siti
node scripts/hermes-bootstrap.mjs --upgrade --employees=praroro,siti
node scripts/hermes-bootstrap.mjs --upgrade --employees=growth
```

Unselected existing profiles are not touched by that bootstrap run.

See [EMPLOYEE-PACKS.md](EMPLOYEE-PACKS.md) for standalone release ZIPs and local pack generation.

## After installation

If Hermes does not yet have a model/provider configured, run:

```bash
hermes setup --portal
```

Then verify:

```bash
hermes profile list
hermes kanban boards show
```

You should see the selected baseline profile distributions and the `nyobakantorai` board. A default install still selects all sixteen.

The office runs at `http://127.0.0.1:4322` by default.

## Safe update behavior

Stable installer behavior is intentionally immutable and conservative:

- stable mode resolves a tagged GitHub release, not mutable `main`;
- `install-manifest.json` and `INSTALL-SHA256SUMS.txt` must both agree with the downloaded core artifact;
- release tag, package version, source commit, byte size, and SHA-256 are checked before unpacking;
- any integrity failure stops installation with no fallback to Git clone or branch archive;
- stable mode refuses to mutate a non-empty existing install directory;
- installation provenance is recorded in `.nyobakantorai-install.json`.

Mutable source is still available only through explicit development mode:

```bash
./install.sh --channel development --ref main
```

```powershell
.\install.ps1 -Channel development -Ref main
```

Hermes profile bootstrap remains separately conservative:

- normal `install` mode skips a profile that already exists;
- `--upgrade` uses native `hermes profile update` for existing distributions and installs missing workers;
- it never copies `.env`, `auth.json`, model/provider secrets, memories, sessions, or runtime databases;
- use `--force` only when you explicitly want public distribution-owned files replaced;
- user-owned Hermes state remains outside the release artifact integrity contract.

See [INSTALL-INTEGRITY.md](INSTALL-INTEGRITY.md) for the stable channel and release-asset threat boundary.

## Core-only mode

If you only want the UI and evidence/task model, omit `--with-hermes` / `-WithHermes`. The office remains localhost-only and reports `runtime_adapter: none`.

## Upstream

Hermes Agent is maintained upstream at https://github.com/NousResearch/hermes-agent. nyobakantorai does not vendor Hermes itself.

For migration details see [V0.3-UPGRADE.md](V0.3-UPGRADE.md). For Telegram/multiplex gateways see [TELEGRAM-OFFICE.md](TELEGRAM-OFFICE.md).
