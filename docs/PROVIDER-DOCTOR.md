# Unified Provider Doctor

The Unified Provider Doctor answers one question safely:

> What can this machine **detect right now**, and what does the user still need to configure before a self-test?

It does **not** install anything, log in, call a provider, change credentials, or claim live evaluation.

## Run it

Human-readable:

```bash
npm run provider:doctor
```

Machine-readable:

```bash
npm run provider:doctor:json
```

Filter providers:

```bash
node scripts/provider-doctor.mjs --provider hermes,cognee,browser-use
```

Require specific installation/readiness in user automation:

```bash
node scripts/provider-doctor.mjs --provider cognee --require-installed cognee
node scripts/provider-doctor.mjs --provider playwright-mcp --require-ready playwright-mcp
```

Those requirement flags are opt-in. Optional providers do not fail the normal project release gate merely because a user has not installed them.

## Current catalog

The doctor currently understands:

- Hermes Agent;
- Codex CLI;
- Gemini CLI;
- GitHub Copilot CLI;
- Cognee / Hermes memory candidate;
- Browser Use;
- Playwright MCP.

The catalog lives at `config/provider-doctor.json`, not in hard-coded UI conditionals.

## State model

Each provider reports independent dimensions:

```text
support_state
install_state
configuration_state
self_test_state
readiness
```

Examples:

```text
SUPPORTED
NOT_INSTALLED
UNKNOWN
NOT_RUN
NEEDS_INSTALL
```

or:

```text
SUPPORTED
INSTALLED
CONFIG_SIGNAL_PRESENT
NOT_RUN
READY_FOR_SELF_TEST
```

`READY_FOR_SELF_TEST` is **not** `LIVE_EVALUATED`.

Likewise, an OAuth-capable CLI with no environment-variable signal is reported as `UNKNOWN`, not falsely as `NOT_CONFIGURED`.

## Privacy

The doctor may detect that a known environment variable is present, but it records only:

```text
configuration_signal_count = N
```

It never includes the credential value in output.

Detection is read-only:

- executable lookup searches PATH without executing the provider;
- Python module lookup uses `importlib.util.find_spec`;
- Node module lookup uses module resolution only;
- on-demand Playwright availability checks whether the package runner exists but does not download the MCP package;
- no provider self-test runs automatically.

## Why this exists

Open-source users will have different stacks.

One user may have Hermes + Cognee, another Codex + Playwright, and another Gemini without Browser Use. The repository should provide a supported integration path without requiring the author machine to own every vendor account.

The claim boundary remains:

```text
SUPPORTED
!= INSTALLED
!= CONFIGURED
!= SELF_TEST_PASSED
!= LIVE_EVALUATED
```

Provider-specific live evaluation remains separate and evidence-backed.
