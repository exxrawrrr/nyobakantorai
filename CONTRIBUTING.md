# Contributing

Thanks for improving nyobakantorai.

1. Fork or branch from `main`.
2. Keep changes local-first and least-privilege.
3. Do not introduce hidden network calls, auto-dispatch, or destructive defaults.
4. Add or update tests for behavior changes.
5. Run `npm run verify` before opening a pull request.
6. Never include real credentials, personal paths, runtime databases, logs, receipts, screenshots, or user/client data.
7. Use synthetic fixtures only. The public tree must not depend on a contributor's private machine or workspace.

## Design rules

- Human approval beats autonomous execution.
- Runtime claims must be verifiable.
- External integrations fail closed.
- Skills are instructions, not permissions.
- Core paths are configurable instead of machine-specific.
- Public assets need explicit compatible provenance and licensing.
- A test that proves a safety boundary is preferred over a comment claiming one.

Small, reviewable commits are preferred.
