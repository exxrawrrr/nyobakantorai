# v0.9.0 Team Office — Multi-User Projects + RBAC + Shared Audit

Status: **DESIGN LOCKED FOR CHAT 29**
Date: 2026-10-02
Baseline: `main@d6abdd8e57a3f8da899bcd8c8cb6351d9620bb66`

## Goal

Move from a single human owner/operator assumption to a governed multi-user workspace without weakening any existing employee, connector, approval, cost, artifact, evidence, or memory boundary.

## Non-negotiable rule

**Authority is derived, never supplied by the caller.**

Every team-sensitive decision must derive authority from canonical:
1. human identity;
2. workspace;
3. project membership;
4. role policy;
5. optional bounded delegation;
6. exact resource binding.

No caller-provided project list, shared scope, connector scope, or approval role may widen authority.

## Identity and membership

Human users are distinct from AI employees.

Canonical human roles:
- OWNER
- ADMIN
- APPROVER
- MEMBER
- VIEWER

A workspace contains projects. Membership is exact to one workspace/project and one role. Cross-workspace or cross-project reuse of a membership fails closed.

## RBAC

Permissions are policy-owned. A membership contributes only permissions configured for its role.

Representative permissions:
- project.read
- project.execute
- project.manage
- approval.request
- approval.decide
- approval.delegate
- connector.use
- artifact.read
- artifact.write
- evidence.read
- memory.read
- memory.promote
- budget.view
- budget.spend
- audit.read

OWNER is not an implicit universal bypass: every permission must still exist in policy.

## Approval ownership and delegation

Existing owner-only Approval Center remains intact for legacy single-owner workflows.

Team Office adds a separate delegated authorization contract:
- delegator and delegate must be active members of the same workspace/project;
- delegator must have approval.delegate;
- delegate must have approval.decide;
- delegation actions/resources must be a subset of the delegator's requested boundary;
- delegation is time-bounded and content-addressed;
- delegated approval is evidence, not owner impersonation;
- authorization requires exact approval request + delegation + decision bindings.

No delegation may create wildcard scope or outlive the parent request.

## Workspace-scoped connectors

A connector binding belongs to one workspace and optionally one project. Use requires:
- exact active membership;
- connector.use permission;
- workspace/project match;
- an already-valid Connector Center route decision.

Team Office never turns CONNECTED into authority and never exposes credential values.

## Workspace/project budgets

Team Office maintains workspace and project budget envelopes. Spend admission requires:
- budget.spend permission;
- matching workspace/project;
- known non-negative spend state;
- same currency;
- projected spend at or below both applicable ceilings.

Budget UNKNOWN or cross-scope ledger entries fail closed.

Existing Cost Governor remains authoritative for Mission/provider cost limits; Team Office adds the human/workspace envelope above it.

## Collaboration-safe memory

Project Brain continues to own memory records and promotion lineage.

Team Office derives `authorizedProjectIds` and `authorizedSharedScopes` from active memberships/policy, then calls Project Brain view construction. Callers cannot pass arbitrary project IDs or shared scopes.

## Shared artifact/evidence access

Team Office binds Artifact/Evidence refs to workspace/project and a minimum role/permission requirement. Access requires exact membership + permission + binding match. No wildcard resource binding.

## Immutable shared audit

Every team-sensitive decision appends a content-addressed event with:
- sequence;
- timestamp;
- workspace/project;
- actor user;
- action;
- resource;
- outcome;
- evidence/decision refs;
- previous event hash.

Validation recomputes every event and chain link. Deletion, reorder, mutation, or actor/scope rewrite is detectable.

## Threat model

CHAT 29 explicitly defends against:
- horizontal project access;
- cross-workspace confused deputy;
- role spoofing;
- stale/forged membership;
- delegation scope escalation;
- connector scope bleed;
- project-memory scope injection;
- artifact/evidence IDOR;
- budget scope mixing;
- audit deletion/reordering/tampering.

It does not claim enterprise SSO, cryptographic user authentication, remote database isolation, or production tenant infrastructure. Those require live deployment evidence.

## v0.9.0 truth

Static repository contracts may PASS while release remains BLOCKED.

Release requires:
- live multi-user isolation evidence;
- live delegated-approval evidence;
- live shared-audit observation;
- v0.8.1 prerequisite readiness;
- package promotion to 0.9.0;
- tagged release gate.

Until then package remains 0.5.1 and no v0.9.0 tag/release is authorized.
