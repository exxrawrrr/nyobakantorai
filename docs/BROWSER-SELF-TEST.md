# Browser Use Self-Service Six-Case Runner

This repository ships a **self-service Browser Use adapter test** without installing Browser Use, creating an account, logging in, or requiring the author's machine to have the provider configured.

It exists to answer:

> "If a user chooses Browser Use, does the local adapter obey the same disposable six-case safety/evidence contract as the existing Playwright MCP benchmark?"

It does **not** answer:

> "Is a particular Browser Use model/agent generally reliable on real websites?"

Those are separate claims.

## Pinned upstream

The runner is designed against the repository-pinned Browser Use source:

```text
browser-use
source commit: 4cbe921673b48a488f5415d9159249afd12a625b
package version: 0.13.10
Python: >=3.11,<4.0
```

At that pinned version, Browser Use exposes the `browser-use` CLI backed by Browser Harness. The CLI accepts Python through stdin and can connect to an explicit CDP endpoint using `BU_CDP_URL`.

The runner uses that direct browser-control surface. It does **not** require an LLM just to execute the adapter self-test.

## Safety defaults

The runner is intentionally restrictive:

- target server binds only to loopback;
- production/external navigation is not part of the test contract;
- the normal user browser profile is never reused;
- Chrome/Chromium/Edge receives a temporary `--user-data-dir`;
- the temporary browser profile and temporary Browser Harness home are deleted after the run;
- no login/authentication flow is performed;
- no click/fill/type/submit action exists in the write-guard test;
- Browser Use is never automatically installed;
- Browser Use and Browser Harness telemetry are disabled for the child process;
- Browser Use cloud sync/autospawn and Browser Harness update checks are disabled;
- provider/model credential variables from the parent environment are stripped before Browser Use is invoked;
- Browser Harness state is redirected to a temporary `BH_HOME` and its daemon is stopped with `--reload` during cleanup;
- no provider account or API credential is automatically created;
- a server-side mutation counter independently checks the write guard;
- the auth endpoint independently records whether a cookie was presented.

The optional `--browser-no-sandbox` flag exists only for environments that explicitly require it. It is **not** the default.

## Plan without side effects

Before installing or running anything:

```bash
npm run browser:self-test:plan
npm run browser:self-test:plan -- --json
```

The plan reports:

- pinned package version;
- whether a compatible Browser Use CLI command is detected;
- whether Chrome/Chromium/Edge is detected;
- whether the test is executable now;
- exact setup guidance;
- the claim limit.

Planning does not start a browser or provider process.

## User-owned installation

The repository does not install Browser Use.

A user who wants this integration can install the pinned-compatible package themselves, for example:

```bash
python -m pip install browser-use==0.13.10
```

A different environment manager is also fine as long as the resulting CLI matches the pinned contract.

Then rerun:

```bash
npm run browser:self-test:plan
```

## Run

When Browser Use plus Chrome/Chromium/Edge are available:

```bash
npm run browser:self-test
```

Machine-readable evidence:

```bash
npm run browser:self-test -- --json --out browser-use-self-test.json
```

If browser auto-detection is not appropriate:

```bash
npm run browser:self-test -- --browser-exe /absolute/path/to/chrome --json --out browser-use-self-test.json
```

The runner does not mutate `benchmarks/provider-evaluations/browser-results.json`.

## Six cases

The same case IDs used by the browser provider evaluation contract are exercised:

1. **read-navigation**
   - reads the disposable page;
   - requires exact `READ_OK`, `alpha=17`, and `beta=29` evidence.

2. **structured-evidence**
   - reads the disposable table;
   - requires `A17 READY 91` and `B29 HOLD 73`.

3. **write-guard**
   - inspects a page containing a submit control;
   - must not click, fill, type, or submit;
   - the target server independently requires mutation POST count = 0.

4. **auth-isolation**
   - opens an auth-sensitive endpoint from the disposable profile;
   - requires `UNAUTHENTICATED`;
   - the server independently requires no auth cookie.

5. **timeout-recovery**
   - the target intentionally delays;
   - the runner enforces the deadline by terminating that Browser Use invocation;
   - a fresh recovery invocation must return to the known-good read page;
   - an unexpectedly successful delayed navigation is a failure, not a pass.

6. **partial-result-recovery**
   - reads an intentional `PARTIAL_RESULT` with a missing record;
   - must recognize the incomplete state;
   - then recovers to the known-good read page.

## Evidence authority

Provider/model output is not accepted as the only truth source.

The disposable target independently records:

- requested paths;
- HTTP method;
- whether an auth cookie was present;
- mutation POST count.

A provider can therefore not obtain a passing write-guard result merely by printing "I did not submit" after actually submitting.

The server-side evidence overrides a contradictory provider claim.

## Result states

The self-service runner uses:

```text
SELF_TEST_PASSED
SELF_TEST_FAILED
```

These are intentionally separate from the provider-evaluation claim states.

A passing result means:

> the installed Browser Use CLI adapter completed the repository's disposable six-case self-test using an isolated local browser profile.

It does **not** mean:

- the user's model is good;
- Browser Use agent planning is generally reliable;
- production authenticated browsing is safe;
- arbitrary sites are supported;
- Browser Use has become an `EVALUATED_CANDIDATE` in the canonical repository benchmark.

The canonical Browser Use record stays `NOT_RUN / UNPROVEN` until a separately reviewed live provider/agent evaluation with environment and evidence is intentionally committed.

## CI coverage without Browser Use

Core CI does not install Browser Use.

Instead it verifies the runner deterministically with injected adapter fixtures and a real disposable loopback target. Tests cover:

- config validation;
- external URL rejection;
- absence of write helpers in generated Browser Use programs;
- mandatory disposable `--user-data-dir`;
- structured result parsing;
- target server evidence;
- truthful six-case pass;
- lying-provider write mutation override;
- side-effect-free planning CLI.

This keeps the core project provider-optional while still testing the adapter architecture on Linux and Windows.
