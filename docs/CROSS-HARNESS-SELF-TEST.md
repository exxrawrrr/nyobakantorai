# Cross-Harness Self-Service Parity Runner

This repository ships a self-service runtime probe for:

- Hermes Agent
- Codex CLI
- Gemini CLI
- GitHub Copilot CLI

The goal is deliberately narrow:

> run the same disposable skill, prompt, exact-output contract, and verification rules across installed harnesses without auto-installing, auto-login, or touching the user's working repository.

This is **not** a benchmark winner picker and does not claim that the four products are behaviorally identical.

## What is tested

Every run uses the same disposable skill:

```text
nyoba-cross-harness-probe
```

The probe skill contains a private activation sentinel and exact output contract. The user prompt names the skill but does not contain the sentinel or result marker.

That distinction matters: a passing harness must actually expose the staged skill instructions to the model. Merely answering the visible prompt cannot reproduce the required sentinel legitimately.

The task checks:

```text
skill_activated
objective_exact
protected_atoms_exact
prohibited_action_exact
verification_exact
invented_actions_zero
workspace_canary_unchanged
```

Protected atoms include a Windows path, Rupiah amount, date, and URL so punctuation/escaping drift is visible.

## Safety model

The runner never executes in the user's repository.

For each selected harness it creates a fresh temporary workspace containing only:

- the disposable probe skill;
- a canary file used to detect a write to protected workspace content.

The workspace is deleted after that harness finishes.

The runner never:

- installs a harness;
- logs into a provider;
- creates credentials;
- changes an account;
- enables YOLO / allow-all permission modes;
- modifies the canonical cross-harness benchmark;
- persists raw stdout or stderr in the evidence report.

Credential values remain user-owned. The child harness may use whatever authentication the user has already configured, but the runner stores only bounded result metadata and validated probe fields.

## Harness-specific isolation

### Hermes

The runner does **not** mutate `~/.hermes/skills` or the user's profile.

Instead it points `HERMES_BUNDLED_SKILLS` at a temporary probe-skill directory for that process and runs a one-shot query with:

```text
--ignore-rules
--toolsets skills
--skills nyoba-cross-harness-probe
--query-file -
--format stream-json
```

The user's existing model/provider authentication remains their responsibility.

### Codex

The temporary workspace exposes:

```text
.agents/skills/nyoba-cross-harness-probe/SKILL.md
```

Execution uses:

```text
codex exec
--skip-git-repo-check
--sandbox read-only
--ephemeral
--json
-
```

The runner does not use bypass-sandbox or approval-bypass modes.

### Gemini CLI

The temporary workspace exposes the same `.agents/skills` shape.

Execution uses:

```text
--approval-mode=plan
--skip-trust
--output-format json
-p <probe prompt>
```

Plan mode is used because the probe requires analysis only and no write action.

### GitHub Copilot CLI

The temporary workspace exposes:

```text
.github/skills/nyoba-cross-harness-probe/SKILL.md
```

Execution uses non-interactive prompt mode with JSON output and `--silent`.

The runner does not pass `--allow-all-tools`, `--allow-all-paths`, `--allow-all-urls`, or another permission-bypass flag.

## Plan without provider execution

```bash
npm run harness:self-test:plan
```

Machine-readable:

```bash
npm run harness:self-test:plan -- --json
```

One harness:

```bash
npm run harness:self-test:plan -- --target codex
```

Several:

```bash
npm run harness:self-test:plan -- --target hermes,codex
```

Planning only detects executable presence on PATH. It does not execute a harness or provider.

## Run

Run all detected targets:

```bash
npm run harness:self-test
```

Run selected targets:

```bash
npm run harness:self-test -- --target codex,gemini-cli
```

Save a bounded evidence report:

```bash
npm run harness:self-test -- --target codex,gemini-cli --json --out cross-harness-self-test.json
```

A missing selected CLI remains:

```text
status = NOT_RUN
claim_state = UNPROVEN
```

It is never converted into a fake failure or fake success.

## Result interpretation

Per harness:

```text
SELF_TEST_PASSED
SELF_TEST_FAILED
NOT_RUN / UNPROVEN
```

Run-level:

```text
COMPARISON_READY
UNPROVEN
```

`COMPARISON_READY` requires at least two harnesses to complete and pass the exact same probe in the same run with no completed failures.

It means only:

> those passing installed harnesses loaded the disposable probe skill and satisfied the same exact-output contract in isolated temporary workspaces.

It does **not** prove:

- all 40 canonical skills behave identically;
- the models are equally capable;
- external tools behave the same;
- authenticated production tasks behave the same;
- one harness is better than another;
- canonical broad behavioral portability.

The repository's historical cross-harness record remains separate until reviewed live evidence is intentionally promoted.

## Deterministic CI

Core CI does not install or authenticate any of the four external harnesses.

Instead it verifies:

- config pinning and safety defaults;
- sentinel exists only in the skill, not in the visible task prompt;
- harness-specific skill staging;
- conservative invocation arguments;
- JSON/text/JSONL result parsing;
- exact protected-atom validation;
- side-effect-free planning;
- four-harness injected pass path;
- partial installed-target comparison;
- forged/wrong sentinel failure;
- canary mutation override;
- non-zero process and missing-marker failure;
- raw stdout/stderr non-persistence.

This proves the runner and its claim boundaries, not live provider behavior.
