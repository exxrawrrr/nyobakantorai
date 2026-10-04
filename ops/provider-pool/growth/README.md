# GROWTH provider-pool operator kit

This directory mirrors the non-secret operator scripts used during the authorized 2026-10-04 provider-pool lab on the Windows workstation **GROWTH**.

It is intentionally workstation-specific. Paths point to the authorized GROWTH layout under `D:\RAFDI_DATA\03_AI_OFFICE`.

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
