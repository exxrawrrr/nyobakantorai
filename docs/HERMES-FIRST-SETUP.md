# Hermes-first setup

This is the recommended path when you want nyobakantorai to behave like a real Hermes-backed office instead of a standalone visual demo.

## What gets installed

The nyobakantorai installer can:

1. install or reuse the upstream **Hermes Agent** CLI;
2. download/update nyobakantorai;
3. validate the runtime prerequisites;
4. install or safely upgrade the native Hermes profile distributions from `config/employees.json`;
5. install the canonical role skills and fresh-install toolset defaults assigned to each employee;
6. create/switch the Hermes Kanban board named `nyobakantorai`;
7. optionally start the localhost office.

It does **not** copy the author’s credentials, provider configuration, API keys, billing settings, sessions, memories, messaging tokens, or private runtime databases.

## Windows — fastest path

Open PowerShell and run:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/exxrawrrr/nyobakantorai/main/install.ps1))) -WithHermes -Start
```

The `-WithHermes` flag is explicit permission to invoke the official Hermes upstream installer if Hermes is not already installed. If you prefer to inspect scripts before execution, download `install.ps1` and the Hermes upstream installer first, review them, then run locally.

## Linux / macOS / WSL2 — fastest path

```bash
curl -fsSL https://raw.githubusercontent.com/exxrawrrr/nyobakantorai/main/install.sh | bash -s -- --with-hermes --start
```

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

You should see sixteen baseline `@0.3.0` profile distributions and the `nyobakantorai` board.

The office runs at `http://127.0.0.1:4322` by default.

## Safe update behavior

The bootstrap is intentionally conservative:

- normal `install` mode skips a profile that already exists;
- `--upgrade` uses native `hermes profile update` for existing distributions and installs missing workers;
- it never copies `.env`, `auth.json`, model/provider secrets, memories, sessions, or runtime databases;
- use `node scripts/hermes-bootstrap.mjs --upgrade` for v0.2 → v0.3 migration; native Hermes update preserves existing user config/state;
- use `--force` only when you explicitly want the public distribution files to replace the profile’s distribution-owned files;
- Hermes user-owned data remains protected by Hermes’ own distribution installer rules.

## Core-only mode

If you only want the UI and evidence/task model, omit `--with-hermes` / `-WithHermes`. The office remains localhost-only and reports `runtime_adapter: none`.

## Upstream

Hermes Agent is maintained upstream at https://github.com/NousResearch/hermes-agent. nyobakantorai does not vendor Hermes itself.

For migration details see [V0.3-UPGRADE.md](V0.3-UPGRADE.md). For Telegram/multiplex gateways see [TELEGRAM-OFFICE.md](TELEGRAM-OFFICE.md).
