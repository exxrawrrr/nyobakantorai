# v0.8.1 Mission Control + Sandbox Hardening — CHAT 28

Status: **DESIGN LOCKED FOR CHAT 28**  
Date: 2026-10-02  
Baseline: `main@86c8cd290dc98640d2e357d29d13686131d49109`

## Goal

Support longer bounded Missions without creating a second executor or widening authority.

Mission Control is a supervisory layer over the existing Mission Engine. It controls safe slicing, fair queue selection, pause/resume checkpoints, bounded adaptive proposals, escalation, and checkpoint-aware rerouting. Execution remains owned by `packages/mission-engine/orchestrator.mjs`.

## Architecture

```text
Mission Plan
  -> Mission Control policy
  -> fair runnable queue selection
  -> existing Mission Engine
       -> Cost Governor
       -> RuntimeExecutionAdapter
       -> Capability / approval evidence
  -> safe batch boundary
  -> continue | PAUSE + checkpoint | CANCEL
  -> checkpoint-aware recovery through existing recovery policy
```

No direct production write authority is added.

## Long-running slicing

A controlled run has hard bounds for:

- maximum parallel tasks;
- maximum parallel tasks per employee;
- maximum batches per slice;
- maximum wall-clock time per slice;
- maximum total Attempts before escalation.

Reaching a slice boundary must produce a stoppable `PAUSED` Mission at a safe boundary: no RUNNING TaskNode and no RUNNING Attempt.

A paused checkpoint is resumable without consuming the failure-recovery cycle budget.

## Queue balancing

The only CHAT 28 queue strategy is `FAIR_EMPLOYEE_ROUND_ROBIN`.

The queue selector:

- chooses only currently runnable TaskNodes;
- never exceeds Mission Engine `maxConcurrency`;
- never exceeds the per-employee concurrency cap;
- prefers workers with fewer dispatches;
- uses attempt count and task ID as deterministic tie-breakers.

It cannot create tasks, bypass dependencies, or alter approval/capability scope.

## Checkpoint-aware rerouting

Provider rerouting reuses `checkpoint-recovery` policy. Mission Control may expose the existing allowlisted recovery choice and escalation reason, but cannot name a provider that `chooseRecoveryProvider()` would reject.

## Bounded adaptive planning

Adaptive planning is proposal-only.

A proposal has:

- exact Mission ID;
- reason and evidence references;
- bounded new TaskNode/edge counts;
- capabilities that are a subset of the declared authority baseline;
- `owner_review_required=true`;
- `automatic_apply_allowed=false`.

Mission Control never mutates the canonical Mission graph from an adaptive proposal in CHAT 28.

## Stop and escalation

Automatic supervisory outcomes:

- `CONTINUE`: within all slice limits;
- `PAUSE`: wall-clock or batch slice reached;
- `ESCALATE`: total-attempt ceiling reached or a bounded adaptive/recovery decision cannot proceed safely;
- `STOP`: reserved for explicit cancel/stop condition or an existing hard policy such as Cost Governor STOP.

Escalation does not silently cancel completed work.

## Stronger sandbox isolation

CHAT 28 does not claim OS/container isolation. It adds a stricter application-level isolation contract that must be proven before calling a runtime “hardened”:

- filesystem: temporary workspace only, production repository read-only, no host-home access;
- browser: ephemeral profile only, no user-profile reuse, no credential-store access;
- network: allowlist-only, bounded host count, DNS-rebinding defense declared;
- resources: bounded processes and workspace bytes;
- credentials: reference-only, no task-payload values, no secret environment injection into the task.

The hardening assessment is content-addressed and fail-closed. It composes with, rather than replaces, Live Sandbox admission.

## v0.8.1 release truth

Static Mission Control / hardening / recovery contracts may pass while publication remains BLOCKED.

A release requires:

- qualifying live long-running Mission evidence;
- qualifying live hardened-sandbox isolation observation;
- prerequisite `v0.8.0` readiness;
- package promotion to 0.8.1;
- tag/release gates.

Until then package metadata remains 0.5.1 and no v0.8.1 tag/release is authorized.
