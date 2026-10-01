# v0.6 Live Sandbox + Minimum Cost/Quota Guard — CHAT 07

Status: **DESIGN LOCKED FOR CHAT 07**  
Date: 2026-10-01  
Baseline: `main@d2d4379b49bd0a45a398221fb77c02ff5bfed7c1`

## Goal

Provide a bounded live-execution policy layer that can admit or reject one model/runtime dispatch before execution, summarize actual/known resource usage after execution, and verify disposable-state teardown without replacing the existing RuntimeExecutionAdapter.

## Architecture

CHAT 07 adds `packages/live-sandbox/`.

It consumes the route and runtime facts already produced by CHAT 04–06 and wraps the existing bounded runtime substrate.

```text
Mission / TaskNode
   -> Model Route
   -> Capability Routes
   -> Live Sandbox admission
   -> RuntimeExecutionAdapter
   -> Sandbox settlement
```

The sandbox never grants production permission.

## Policy v1

A policy defines:

- sandbox ID;
- max duration;
- max tool calls;
- max input tokens;
- max output tokens;
- max total tokens;
- optional hard USD cost ceiling;
- allowed task-network hosts;
- allowed tool IDs;
- allowed runtime providers;
- whether disclosed fallback models are permitted;
- temporary-workspace requirement;
- external-write prohibition;
- credential exposure prohibition.

## Dispatch declaration

Admission requires explicit:

- mission ID;
- task ID;
- runtime provider;
- model identity status:
  - `KNOWN` + non-empty model ID; or
  - `UNKNOWN` + null model ID;
- model route reference when available;
- capability route references;
- tool IDs;
- task-network hosts;
- projected input/output tokens;
- projected tool calls;
- projected cost semantics;
- fallback disclosure;
- credential exposure flag;
- task risk class.

Model identity may be truthfully `UNKNOWN`; it must not be silently invented.

## Cost semantics

Cost is represented as:

```text
KNOWN(amount, USD)
or
UNKNOWN
```

Unknown cost is never normalized to zero.

If a policy has a hard cost ceiling, projected cost must be KNOWN and within the ceiling.

A policy with no hard cost ceiling may admit UNKNOWN projected cost, but the resulting record must keep cost status UNKNOWN.

## Hard ceilings

Admission fails closed when projected:

- duration;
- tool calls;
- input tokens;
- output tokens;
- total tokens;
- known cost

exceed policy.

Actual reported usage, when available, is also checked during settlement.

## Allowlists

Task-visible tools and task-network hosts must be subsets of policy allowlists.

The provider control-plane connection used by the runtime itself is not treated as arbitrary task egress.

External writes remain prohibited by CHAT 07 policy and by the existing runtime execution policy.

## Fallback

Fallback models/providers must be disclosed before execution.

If fallback is not permitted, any disclosed fallback causes rejection.

The sandbox never invents or performs an undisclosed paid fallback.

## Credentials

Runtime-managed authentication may exist outside the task payload.

The sandbox requires:

```text
credentials_exposed_to_task = false
```

It does not inspect or print credentials.

## Settlement

A settled record binds:

- admission decision ref;
- runtime outcome;
- provider/model disclosure;
- projected usage;
- actual usage when known;
- quota status;
- temporary-workspace evidence;
- production-repository mutation check;
- cleanup attempted/ok;
- structured failure reason.

Successful sandbox settlement requires:

- runtime outcome SUCCEEDED;
- temporary workspace proven;
- production repository unchanged;
- cleanup ok;
- no hard actual quota breach.

`SUCCEEDED` sandbox execution still does not imply `VERIFIED`.

## Real-model exit gate

CHAT 07 must attempt one separately bounded real-provider task through the existing canonical live path only when:

- installed provider command is detected;
- no install/login/credential creation is needed;
- repository used for the canonical live harness is clean;
- provider version probe passes;
- the run is explicitly invoked as live;
- no fallback is used.

If those preconditions are unavailable, CHAT 07 must report the exact blocker instead of fabricating live evidence.

## Non-goals

CHAT 07 does not:

- implement full Cost Governor accounting;
- mutate production systems;
- authorize tools/resources;
- select models;
- install/login providers;
- create credentials;
- add OS/container isolation claims;
- expose a public execution API;
- treat subscription usage as zero-dollar cost unless evidence says so.

## Exit conditions

1. sandbox policy and dispatch contracts are tested;
2. token/tool/duration/cost ceilings fail closed;
3. tool/network allowlists fail closed;
4. cost-known/unknown semantics are preserved;
5. hidden fallback is rejected;
6. settlement verifies temporary workspace + teardown;
7. sandbox refs/records are content-addressed;
8. one bounded real-provider task is attempted through the canonical live substrate, with truthful live/blocker evidence.
