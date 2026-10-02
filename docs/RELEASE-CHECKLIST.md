# Public release checklist

A release is not ready because the UI looks good. It is ready only when the public tree, history, CI, provenance, evidence claims, and repository settings agree.

The repository is **already PUBLIC**. The old private-to-public visibility transition is historical; current releases must validate the already-public repository rather than pretending publication has not happened.

## Candidate decision
- [x] Release decision document allows stable promotion.
- [x] Candidate is on the intended final release branch/commit.
- [x] Evidence-dependent gaps are either completed for the release scope or explicitly accepted/deferred by the owner without inflating claims.
- [x] README, changelog, roadmap, evaluation docs, and release notes describe the same capability/evidence state.

For v0.4.0, the owner explicitly accepted the six still-open evidence classes as deferred scope on 2026-09-30. Stable promotion is authorized only after the exact promoted `main` commit passes cross-platform verify and the manual release-gate. See `docs/V0.4-RELEASE-DECISION.md`.

For v0.5.1, the release is **READY and PUBLISHED**. Final-main verify #578 passed on exact source commit `3004220522fee1971453f63bb50e6f9ed1264687`, manual release-gate `36811702004` passed, fresh-clone require-ready exited 0, tagged release-gate `36812543303` verified immutable assets, and the GitHub Release published 25 assets. The immutable `v0.5.0` tag remains a failed publication attempt and was not published as a GitHub Release.

For v0.6.0, CHAT 12 convergence is **BLOCKED**. The CHAT 11 acceptance bundle is 9/11 PASS; `REAL_MODEL_EXECUTION` and `COST_QUOTA_ENFORCEMENT` remain blocked. Package metadata therefore stays at `0.5.1`, `v0.6.0` tag/publication is unauthorized, and the tagged release workflow now fails closed unless v0.6 readiness is `READY`. No public deployment target is configured, so external demo deployment verification is not claimed.

## Code and tests
- [ ] `npm run doctor` passes on the release machine.
- [ ] `npm run ready` passes from the canonical worktree.
- [ ] `npm run verify` passes from the canonical worktree.
- [ ] A fresh clone passes `npm run ready`.
- [x] One-worker isolated fresh-install matrix passes with an empty temporary profile home (`npm run release:matrix:one-worker`). This is deterministic release-matrix evidence, not a real Hermes/provider machine claim.
- [x] Subset isolated fresh-install matrix passes for the engineering preset (`npm run release:matrix:subset`): only Subagjo/Siti/Bimo install, per-worker skill/integration closure stays isolated, Bimo-only uninstall requires explicit destructive confirmation, and survivor profiles remain byte-identical.
- [x] Full-workforce isolated fresh-install matrix passes (`npm run release:matrix:full`): every canonical employee pack verifies, the installed profile set exactly matches the 16-worker registry, every worker keeps its exact skill/integration closure, rerun resolves to native-upgrade for all profiles, and seeded user-owned state survives byte-for-byte. Deterministic simulation only; no real Hermes/provider machine claim.
- [x] Deterministic full-workforce upgrade/uninstall/reinstall lifecycle matrix passes (`npm run release:matrix:lifecycle`): all 16 profiles upgrade from drifted distribution state while user-owned state survives, selective removal is preview-first and preserves every survivor byte-for-byte, full uninstall is preview-first and requires explicit destructive confirmation, reinstall restores exactly 16 clean profiles without resurrecting deleted user state, and pack artifacts remain byte-identical. This is isolated release-matrix evidence, not real Hermes/provider machine coverage.
- [ ] Final real clean-machine Hermes lifecycle coverage is complete on the intended release machine.
- [x] Linux and Windows CI are green on the final v0.5.1 promoted commit (#578).
- [x] Minimum-version CI is green on the final v0.5.1 promoted commit (#578).
- [x] Manual `release-gate` passes from the final v0.5.1 promoted commit (`36811702004`).
- [ ] `npm run demo` completes using synthetic data only.

## Privacy and security
- [ ] Public-release scan reports zero findings.
- [ ] Secret scan reports zero findings.
- [ ] No credentials, auth state, personal/client records, runtime databases, logs, raw private receipts, or private workstation paths are tracked.
- [ ] Runtime integrations remain read-only/fail-closed by default unless an explicitly reviewed capability says otherwise.
- [ ] Application-level permission policy is not described as OS/container/process isolation.

## Provenance and evidence
- [ ] All distributed visual assets have documented compatible provenance.
- [ ] License and third-party notices match the actual public tree.
- [ ] Examples are synthetic and clearly labeled.
- [ ] Provider/evaluation claims include environment/evidence and do not upgrade `NOT_RUN / UNPROVEN` states.
- [ ] Signed receipt claims do not substitute cryptographic authenticity for external-world correctness.
- [ ] Real-task baseline claims preserve failures and synthetic/generated exclusions.

## Repository
- [ ] Description, topics, README, changelog, security policy, support policy, roadmap, review map, and release decision are current.
- [ ] Required CI checks protect `main` where the GitHub plan supports it.
- [ ] Dependency update PRs are reviewed rather than blindly auto-merged.
- [x] Temporary planning docs are absent from the release tree.
- [ ] Release tag and notes are created only after the final promoted commit is fully verified.

## Publication / stable release
- [ ] Verify the repository from an unauthenticated/public view.
- [ ] Confirm public screenshots/assets/docs render correctly.
- [x] Promote the reviewed candidate to `main` through an explicit PR/merge path.
- [x] Rerun verification and manual release-gate from the final v0.5.1 `main` commit.
- [x] Create immutable `v0.5.1` stable tag only after the final gate passes.
- [x] Tagged release-gate `36812543303` verifies immutable install assets and publishes the GitHub Release successfully.
