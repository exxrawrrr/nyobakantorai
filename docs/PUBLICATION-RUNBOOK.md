# Publication runbook

The canonical repository is already **PUBLIC**. This runbook now governs stable release promotion and public verification; it no longer assumes a private-to-public visibility transition.

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
  - `minimum-versions`
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

## 4. Stable promotion

The current v0.4 Draft candidate must not be promoted while `docs/V0.4-RELEASE-DECISION.md` says **HOLD**.

When a future release decision allows promotion:

1. merge/promote the reviewed candidate through an explicit path to `main`;
2. confirm the exact promoted commit SHA;
3. rerun `npm run release:check` and the manual `release-gate` from that final commit;
4. do not treat a merge into a staging/PRD branch as shipment.

## 5. Public verification

Before creating a stable release tag:

- open the repository in a logged-out/private browser window;
- confirm README screenshots render;
- confirm license, security policy, support policy, changelog, roadmap, approval model, and runtime-adapter docs are readable;
- re-check the canonical clone URL: `https://github.com/exxrawrrr/nyobakantorai.git`;
- re-run the manual `release-gate` workflow;
- verify the generated manifest artifact belongs to the public commit SHA.

## 6. v0.4 release

Do not tag the current Draft candidate while the release decision is `HOLD`.

When the deferred release scope is explicitly resolved or accepted and the **final promoted main commit** passes every gate, the intended stable tag is:

```text
v0.4.0
```

Release notes must be based on `CHANGELOG.md` plus the permanent evaluation/release-decision records. They must preserve `NOT_RUN / UNPROVEN` provider states and must not present the 1/20 collecting dataset as a completed real-task baseline.
