# Bounded Live Reference-Run Evidence Harness

Status: **Chat 8 harness implemented; no live runtime evidence is created by CI**

The harness records one canonical Siti reference execution at a time.

Commands:

```bash
npm run portability:live:plan -- --runtime hermes
npm run portability:live:plan -- --runtime codex

npm run portability:live:run -- --runtime hermes --confirm-live
npm run portability:live:run -- --runtime codex --confirm-live
```

The plan command is detection-only. It does not install, log in, create credentials, call a model, or mutate a production repository.

The run command requires explicit --confirm-live.

## Evidence provenance

The harness distinguishes three classes:

- FIXTURE_EVIDENCE
- UNVERIFIED_RUNTIME_ATTEMPT
- LIVE_RUNTIME_EVIDENCE

Fixture execution can never self-promote to live evidence.

Provider-unverified or unsafe activity is recorded as UNVERIFIED_RUNTIME_ATTEMPT, not as live evidence.

## Requirements for LIVE_RUNTIME_EVIDENCE

All of these must hold:

- canonical runtime is Hermes or Codex;
- exact Chat 4 core bundle is unchanged;
- repository worktree is clean;
- exact 40-hex Git commit is recorded;
- runtime command is locally installed and detected;
- runtime --version probe succeeds;
- execution goes through the canonical live harness path with no injected process implementation;
- bounded runtime execution succeeds;
- cleanup succeeds;
- temporary-workspace-only evidence is present;
- production repository mutation is false;
- prohibited-action check passes;
- public-safety scan passes.

A successful provider/model execution is therefore necessary but not sufficient.

## No automatic install/login

The harness never installs Hermes or Codex, logs into a provider, creates or modifies credentials, prints credential values, or mutates the user's production repository.

If authentication is missing, the user must configure the runtime outside the harness using the runtime/provider's supported flow.

## Public-safety gate

Before a record can be emitted as live evidence, it is scanned for secret-like material, private Windows user paths, private POSIX home paths, and credential/private environment assignments.

Generated live records default to:

```text
.nyobakantorai/portability-live/
```

That directory is local/ignored state. A record should only be copied into a tracked public evidence directory after a separate review.

## Comparator compatibility

The output record is directly compatible with the Chat 7 comparator.

A live record still has independent verification state NOT_RUN after Chat 8. Therefore two successful live records can at most reach PORTABILITY_CANDIDATE until the independent verifier work is completed.

## Claim boundary

Chat 8 proves the harness, provenance downgrade rules, preflight requirements, and public-safety gate.

CI uses injected fixture execution only and cannot create LIVE_RUNTIME_EVIDENCE.

No live Hermes or Codex claim is made merely because this harness exists.
