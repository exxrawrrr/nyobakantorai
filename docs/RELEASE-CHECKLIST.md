# Public release checklist

A release is not ready because the UI looks good. It is ready only when the public tree, history, CI, provenance, and repository settings agree.

## Code and tests
- [ ] `npm run verify` passes from the canonical worktree.
- [ ] A fresh clone passes `npm run verify`.
- [ ] Linux and Windows CI are green.
- [ ] `npm run demo` completes using synthetic data only.

## Privacy and security
- [ ] Public-release scan reports zero findings.
- [ ] Secret scan reports zero findings.
- [ ] No credentials, auth state, personal/client records, runtime databases, logs, receipts, or private workstation paths are tracked.
- [ ] No old sensitive commit SHA is reachable or directly fetchable from the repository selected for publication.
- [ ] Runtime integrations remain read-only/fail-closed by default.

## Provenance
- [ ] All distributed visual assets have documented compatible provenance.
- [ ] License and third-party notices match the actual public tree.
- [ ] Examples are synthetic and clearly labeled.

## Repository
- [ ] Description, topics, README, changelog, security policy, support policy, and roadmap are current.
- [ ] Required CI checks protect the default branch where the GitHub plan supports it.
- [ ] Dependency update PRs are reviewed rather than blindly auto-merged.
- [ ] Release tag and notes are created only after the commit is fully verified.

## Publication
- [ ] Visibility remains PRIVATE until every item above is satisfied.
- [ ] After changing visibility, re-check the repository from an unauthenticated/public view.
