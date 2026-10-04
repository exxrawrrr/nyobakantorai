# GROWTH provider-pool operator kit

This directory versions the non-secret Windows operator scripts used by the KANTORAI specialist-provider lab.

The scripts are portable and do **not** embed private workstation paths.

## Runtime configuration

Set these only on the workstation that runs the lab:

- `KANTORAI_PROVIDER_POOL_HOME` — optional. Defaults to `%LOCALAPPDATA%\KANTORAI\provider-pool`.
- `KANTORAI_HERMES_EXE` — optional when `hermes` is already on `PATH`; otherwise set it to the local Hermes executable.

Example for the current PowerShell session:

```powershell
$env:KANTORAI_PROVIDER_POOL_HOME = Join-Path $env:LOCALAPPDATA 'KANTORAI\provider-pool'
$env:KANTORAI_HERMES_EXE = (Get-Command hermes).Source
```

Included:

- fail-closed Ollama start/stop and SHA-256 finalizer;
- Qwen3 0.6B + DeepSeek-R1 1.5B pull/test tooling;
- explicit specialist provider broker;
- Gemini AI Studio setup with process-scoped AQ-key compatibility;
- read-only provider-pool status;
- locked routing policy and broker contract.

Excluded on purpose:

- API keys and credential stores;
- `auth.json`, `.env`, Telegram tokens;
- Ollama binaries/model blobs;
- Hermes cache/session/request dumps;
- raw user prompts beyond bounded canary markers.

The production default remains Nous / `nous/welcome`. These scripts do not enroll any specialist provider as the production default.
