# Public release checklist

A release is not ready because the UI looks good. It is ready only when the public tree, history, CI, provenance, evidence claims, and repository settings agree.

The repository is **already PUBLIC**. The old private-to-public visibility transition is historical; current releases must validate the already-public repository rather than pretending publication has not happened.

## Candidate decision
- [ ] Release decision document allows stable promotion.
- [ ] Candidate is on the intended final release branch/commit.
- [ ] Evidence-dependent gaps are either completed for the release scope or explicitly accepted/deferred by the owner without inflating claims.
- [ ] README, changelog, roadmap, evaluation docs, and release notes describe the same capability/evidence state.

For the current v0.4 Draft candidate, stable promotion is **HOLD**. See `docs/V0.4-RELEASE-DECISION.md`.

## Code and tests
- [ ] `npm run doctor` passes on the release machine.
- [ ] `npm run ready` passes from the canonical worktree.
- [ ] `npm run verify` passes from the canonical worktree.
- [ ] A fresh clone passes `npm run ready`.
- [x] One-worker isolated fresh-install matrix passes with an empty temporary profile home (`npm run release:matrix:one-worker`). This is deterministic release-matrix evidence, not a real Hermes/provider machine claim.
- [x] Subset isolated fresh-install matrix passes for the engineering preset (`npm run release:matrix:subset`): only Subagjo/Siti/Bimo install, per-worker skill/integration closure stays isolated, Bimo-only uninstall requires explicit destructive confirmation, and survivor profiles remain byte-identical.
- [ ] Full/upgrade/uninstall clean-install matrix is complete across the intended release platforms.
- [ ] Linux and Windows CI are green.
- [ ] Minimum-version CI is green.
- [ ] Manual `release-gate` passes from the final promoted commit.
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
- [ ] Temporary planning docs are absent from the release tree.
- [ ] Release tag and notes are created only after the final promoted commit is fully verified.

## Publication / stable release
- [ ] Verify the repository from an unauthenticated/public view.
- [ ] Confirm public screenshots/assets/docs render correctly.
- [ ] Promote the reviewed candidate to `main` through an explicit PR/merge path.
- [ ] Rerun verification and manual release-gate from that final `main` commit.
- [ ] Create the stable tag/release only after the final gate passes.
