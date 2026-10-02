# Install nyobakantorai — AI / Agent Guide

This path is for coding agents, local operators, CI assistants, and other AI systems asked to install nyobakantorai for a human.

The AI installer is intentionally **plan-only by default**.

## Rule zero

An agent must not treat `main` as stable merely because newer code exists there. Stable installation means a published immutable release with verified artifacts.

At the current repository state, `v1.0.0` is still an unreleased evidence-gated candidate; the published stable line remains `v0.5.1`.

## Generate a machine-readable plan

```bash
node scripts/ai-installer.mjs --with-hermes --employees all
```

This prints JSON and performs **no installation**.

## Apply after scope review

```bash
node scripts/ai-installer.mjs --apply --with-hermes --employees all
```

Bounded subset:

```bash
node scripts/ai-installer.mjs --apply --with-hermes --employees siti,praroro
```

Pinned stable version:

```bash
node scripts/ai-installer.mjs --apply --version v0.5.1 --with-hermes --employees all
```

## Agent safety contract

- default mode is `PLAN_ONLY`;
- stable is the default channel;
- stable never silently falls back to mutable `main`;
- mutable source requires explicit development channel/ref;
- stable version and mutable ref cannot be mixed;
- there is no API-key or secret argument;
- user/maintainer private data is not an install input;
- the canonical human installer remains the execution engine;
- stable non-empty-directory refusal stays in force;
- provider/model setup remains user-owned.

After installation, report `.nyobakantorai-install.json` provenance rather than claiming success from process launch alone.

## Development path for agents

Only when the human explicitly asks for mutable source:

```bash
node scripts/ai-installer.mjs --channel development --ref main
```

Review the plan, then:

```bash
node scripts/ai-installer.mjs --apply --channel development --ref main
```

## Completion check

```bash
node scripts/preflight.mjs --runtime
```

Report the install channel, version/ref, exact source commit, integrity state, and employee selection. Do not claim provider connectivity, real task execution, or production readiness unless independently observed.
