# Stability Model

Starting in v0.5, **stable is not a single project-wide adjective**.

Canonical source: `config/maturity-model.json`.

| Dimension | States | Current v0.5 candidate |
| --- | --- | --- |
| Artifact | experimental / candidate / stable | **stable** |
| Contract/API | experimental / candidate / stable | **stable** |
| Runtime adapter | experimental / candidate / stable | **stable** |
| Behavioral evidence | unproven / evaluated-case / repeated | **evaluated-case** |
| Real-world workflow | unproven / collecting / demonstrated | **collecting** |
| Provider lifecycle | not-run / partial / validated | **partial** |

These dimensions are independent: `stable artifact != stable behavior`; `stable API != validated provider lifecycle`; `evaluated-case != repeated`; `collecting != demonstrated`.

**Artifact stable:** `v0.5.1` is a published official GitHub Release. Tagged workflow `36812543303` built and verified immutable core assets, and a post-release isolated install reproduced the exact tagged source commit and checksum.

**Contract/API stable:** the v0.5 runtime, receipt/trust, approval, and portability contracts are shipped in the published v0.5.1 artifact. This does not promote behavioral or provider maturity.

**Runtime adapter stable:** Hermes/Codex reference adapters are shipped in v0.5.1 after conformance tests and the bounded canonical Siti case reached `PORTABILITY_VERIFIED_FOR_REFERENCE_CASE`. This does not imply global runtime parity.

**Behavioral evidence evaluated-case:** bounded Fikri/Playwright live cases and black-box office checks exist; they do not establish general/repeated behavior.

**Real-world workflow collecting:** canonical status remains 1/20 eligible cases with the known failure preserved.

**Provider lifecycle partial:** Playwright has a completed bounded live evaluation while Browser Use and Cognee remain NOT_RUN; real clean-machine Hermes lifecycle remains deferred.

Historical v0.4 deferred truth remains canonical in `config/v0.4-deferred-evidence.json`; v0.5 maturity never rewrites its `UNPROVEN`, `NOT_RUN`, or `COLLECTING` states.

README exposes this snapshot for humans; release claims/manifest expose it machine-readably.

Run `npm run maturity:check`.
