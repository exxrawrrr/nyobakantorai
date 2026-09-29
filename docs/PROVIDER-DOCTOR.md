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


## Catalog safety

The provider catalog itself is validated fail-closed before detection runs. Duplicate provider IDs, malformed provider identifiers, invalid support states, malformed detection arrays, duplicate detection entries, invalid configuration requirements, and malformed environment-signal names cause the doctor to stop instead of producing a misleading report.

The doctor reports only **signal counts and states**. Credential values are never returned, and CI includes a CLI-level regression test that injects a fake credential and proves it does not appear in stdout or stderr.

`READY_FOR_SELF_TEST` still does **not** mean authenticated, executed, or live-proven. It only means the local prerequisites are sufficient to attempt the provider's documented self-test.


## Browser Use next step

Browser Use has a dedicated self-service runner. The doctor does not execute it automatically.

```bash
npm run browser:self-test:plan
npm run browser:self-test -- --json --out browser-use-self-test.json
```

See `docs/BROWSER-SELF-TEST.md`.

This preserves the separation between **detection** and **execution**: Provider Doctor remains read-only, while the user explicitly chooses whether to launch the isolated disposable browser self-test.


## Cognee next step

Cognee has a dedicated self-service memory runner. Provider Doctor remains detection-only and never executes it automatically.

```bash
npm run memory:self-test:plan
npm run memory:self-test -- --json --out cognee-self-test.json
```

For a remote endpoint, the user must additionally provide `--allow-remote` and their own `COGNEE_API_KEY`.

See `docs/COGNEE-SELF-TEST.md`.

This keeps detection, execution, and canonical live-evaluation claims separate.


### Cognee package-free self-test readiness

Cognee is a deliberate exception to the usual install-readiness relationship.

The repository's HTTP self-test does not require a local `cognee` command or Python module. Therefore Provider Doctor can report Cognee as `READY_FOR_SELF_TEST` while its local package state remains `NOT_INSTALLED`.

That means only:

> the repository has enough information to attempt the isolated HTTP self-test path.

It does **not** mean the endpoint is reachable, authenticated, or live-proven. Reachability remains `NOT_CHECKED` until the user explicitly runs `npm run memory:self-test`.
