# Publication runbook

The canonical repository is intentionally kept **PRIVATE** until the owner chooses to publish it.

Use this runbook only after the private release candidate is green.

## 1. Pre-public proof

From a clean clone:

```bash
python -m pip install -r requirements-dev.txt
npm run release:check
```

Confirm all of the following:

- working tree is clean;
- `main` matches GitHub;
- Linux CI passes;
- Windows CI passes;
- the manual `release-gate` workflow passes;
- the `nyobakantorai-manifest` artifact is present;
- end-to-end smoke test boots the built server and validates health, capabilities, runtime fail-closed mode, UI, security headers, canonical character assets, and clean shutdown;
- public-release scan reports zero findings;
- secret scan reports zero findings;
- the historical private-development SHA is not reachable from the canonical repository;
- no open dependency PR remains unreviewed.

## 2. GitHub protection before or immediately after publication

In GitHub repository settings, protect `main` with:

- require status checks before merging;
- require branches to be up to date;
- required checks:
  - `test (ubuntu-latest)`
  - `test (windows-latest)`
- require conversation resolution;
- require linear history;
- disable force pushes;
- disable branch deletion.

For a solo-maintainer repository, mandatory external approval can remain disabled to avoid locking the owner out.

## 3. Code security

In **Settings → Code security and analysis**, enable the protections available to the repository/plan:

- Dependabot alerts;
- Dependabot security updates;
- secret scanning;
- push protection for secrets.

Do not add credentials merely to test these controls.

## 4. Change visibility

Only after the checks above:

**Settings → General → Danger Zone → Change repository visibility → Public**

The publication step is intentionally manual. It should never happen as a side effect of CI, a script, or an agent.

## 5. Public verification

After visibility changes:

- open the repository in a logged-out/private browser window;
- confirm README screenshots render;
- confirm license, security policy, support policy, changelog, roadmap, approval model, and runtime-adapter docs are readable;
- re-check the canonical clone URL: `https://github.com/exxrawrrr/nyobakantorai.git`;
- re-run the manual `release-gate` workflow;
- verify the generated manifest artifact belongs to the public commit SHA.

## 6. First release

Create the first public release only after the public verification passes.

Suggested initial tag:

```text
v0.2.0
```

Release notes should be based on `CHANGELOG.md` and must not claim model/runtime capabilities that are not independently verified.
