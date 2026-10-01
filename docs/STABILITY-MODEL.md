# Stability Model

Starting in v0.5, **stable is not a single project-wide adjective**.

Canonical source: `config/maturity-model.json`.

| Dimension | States | Current v0.5 candidate |
| --- | --- | --- |
| Artifact | experimental / candidate / stable | **candidate** |
| Contract/API | experimental / candidate / stable | **candidate** |
| Runtime adapter | experimental / candidate / stable | **candidate** |
| Behavioral evidence | unproven / evaluated-case / repeated | **evaluated-case** |
| Real-world workflow | unproven / collecting / demonstrated | **collecting** |
| Provider lifecycle | not-run / partial / validated | **partial** |

These dimensions are independent: `stable artifact != stable behavior`; `stable API != validated provider lifecycle`; `evaluated-case != repeated`; `collecting != demonstrated`.

**Artifact candidate:** immutable installer machinery and tamper tests exist. The immutable `v0.5.0` tag failed before publication during tagged asset verification, so `v0.5.1` remains the current artifact candidate until the complete tagged-release pipeline succeeds.

**Contract/API candidate:** runtime, receipt/trust, approval, and portability contracts are executable/tested but unreleased as v0.5 stable contracts.

**Runtime adapter candidate:** Hermes/Codex adapters pass conformance; canonical successful live reference execution across both remains unproven.

**Behavioral evidence evaluated-case:** bounded Fikri/Playwright live cases and black-box office checks exist; they do not establish general/repeated behavior.

**Real-world workflow collecting:** canonical status remains 1/20 eligible cases with the known failure preserved.

**Provider lifecycle partial:** Playwright has a completed bounded live evaluation while Browser Use and Cognee remain NOT_RUN; real clean-machine Hermes lifecycle remains deferred.

Historical v0.4 deferred truth remains canonical in `config/v0.4-deferred-evidence.json`; v0.5 maturity never rewrites its `UNPROVEN`, `NOT_RUN`, or `COLLECTING` states.

README exposes this snapshot for humans; release claims/manifest expose it machine-readably.

Run `npm run maturity:check`.
