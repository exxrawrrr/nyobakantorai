# CHAT 29 Team Office Implementation Plan

**Goal:** Multi-user projects, RBAC, bounded approval delegation, workspace-scoped resources, collaboration-safe memory, shared audit, and truthful v0.9.0 gate.

## Constraints
- GitHub is source of truth.
- Human users are distinct from AI employees.
- Caller cannot self-assert project/shared-resource authority.
- Existing owner-only Approval Center stays backward compatible.
- Existing Connector Center remains authoritative for connector route validity.
- Existing Project Brain remains authoritative for memory lineage.
- Existing Cost Governor remains authoritative for Mission/provider cost ceilings.
- No wildcard workspace/project/resource authority.
- No production SSO/database/isolation claims without live evidence.

## Tasks
1. RED Team Office acceptance tests.
2. Human identity/workspace/project membership contracts.
3. RBAC authorization derivation.
4. Bounded approval delegation + delegated decision authorization.
5. Workspace/project connector binding.
6. Workspace/project budget envelope.
7. Project Brain access derived from memberships.
8. Artifact/evidence ACL binding.
9. Immutable shared audit hash chain.
10. Multi-user threat-model documentation.
11. v0.9.0 fail-closed live-evidence/readiness gate.
12. Full regression, GitHub PR, 3-lane exact-main CI.

## Closure

Repository-level implementation completed and deterministically verified. Publication remains fail-closed behind live multi-user isolation, delegated approval, shared-audit evidence, and v0.8.1 prerequisite readiness.
