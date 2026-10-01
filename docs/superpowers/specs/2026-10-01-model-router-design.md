# v0.6 Model Router Design

Status: **CHAT 05 DESIGN — APPROVED SCOPE FROM LIVE WORKFORCE MASTER PRD**  
Date: 2026-10-01  
Baseline: `main@634bdcd76d538d92d80ac31c4454ce469652cae6`

## Goal

Add a provider-neutral Model Router that turns explicit task requirements, policy, budget, privacy/locality, context, latency, modality, and provider-health facts into an inspectable model/runtime route decision.

The router is a **decision layer only**. It does not call a model, open a network connection, install a runtime, authorize a connector, or execute a Mission.

## Existing boundary

CHAT 04 already carries an optional `model_route_ref` into each Execution Attempt.

CHAT 05 fills that seam without rewriting the Mission Orchestrator.

```text
TaskNode + planning metadata
        |
        v
Model Router
        |
        +--> selected model/runtime candidate
        +--> policy-preserving fallback candidates
        +--> rejection evidence
        +--> model-route:sha256:<decision digest>
        |
        v
caller/runtime resolver
        |
        v
Mission Orchestrator -> bounded runtime execution
```

## Package boundary

Create:

`packages/model-router/`

This package is justified by ADR-0001 / the v0.6 Architecture Lock because model selection is independent from:

- employee routing;
- capability authorization;
- runtime execution;
- Mission orchestration.

Do not create a second runtime adapter or capability router.

## Model classes

The router supports exactly these v1 task classes:

- `FAST`
- `REASONING`
- `VISION`
- `CODING`
- `LOCAL_SENSITIVE`

Task class is a routing requirement, not a provider name.

## Route request v1

A route request contains:

- `task_class`;
- required `modalities`;
- `reasoning_depth`: LOW / MEDIUM / HIGH;
- `min_context_tokens`;
- optional `latency_target_ms`;
- estimated input/output token counts;
- optional hard `budget_usd`;
- `privacy`: STANDARD / LOCAL_ONLY;
- `allow_fallback`;
- user/provider policy:
  - optional allowed providers;
  - denied providers;
  - `allow_cloud`;
- provider-health snapshot.

`LOCAL_SENSITIVE` implies:

```text
privacy = LOCAL_ONLY
allow_cloud = false
```

even if a caller tries to pass weaker settings.

## Candidate v1

A candidate describes one selectable model/runtime pair:

- `model_id`;
- `provider_id`;
- `runtime_id`;
- supported task classes;
- supported modalities;
- max reasoning depth;
- locality: LOCAL / CLOUD;
- context window;
- p95 latency;
- input/output price per million tokens, each nullable when unknown;
- enabled flag.

The candidate is descriptive metadata only. It does not prove a provider is reachable or authorized.

## Provider health

Health states:

- `HEALTHY`
- `DEGRADED`
- `DOWN`
- `UNKNOWN`

`DOWN` and `UNKNOWN` candidates are ineligible in v1.

Reason: absence of health evidence is not evidence of availability.

## Hard filters

A candidate is rejected when any of these apply:

- disabled;
- task class unsupported;
- required modality unsupported;
- reasoning depth insufficient;
- context window too small;
- provider denied/not in allowlist;
- cloud forbidden by policy;
- locality violates LOCAL_ONLY;
- provider health DOWN/UNKNOWN;
- p95 latency exceeds a hard latency target;
- estimated cost exceeds hard budget;
- cost is unknown while a hard budget exists.

Unknown cost must never be treated as zero.

## Scoring

Only hard-filter survivors are scored.

v1 score is deterministic and explainable. Preference order:

1. provider health: HEALTHY over DEGRADED;
2. lower estimated total cost;
3. lower p95 latency;
4. deterministic lexical model ID tie-break.

The router returns the score inputs/breakdown. The score is not execution evidence.

## Fallback

If `allow_fallback=false`, no fallback list is returned.

If allowed, fallback candidates are the remaining eligible candidates in deterministic score order.

Fallbacks are filtered by the **same hard policy** as the selected model.

A `LOCAL_SENSITIVE` request must never include a CLOUD fallback.

If no eligible candidate remains, routing fails closed with a structured `MODEL_ROUTE_UNAVAILABLE` error and rejection evidence.

## Route evidence

Successful decisions return:

- schema/version;
- normalized request;
- selected candidate + estimated cost;
- fallback candidates;
- rejected candidates + reason codes;
- health snapshot used;
- deterministic `model_route_ref`:
  `model-route:sha256:<digest>`.

The digest is computed from the canonical decision payload excluding the ref itself.

Same normalized facts must produce the same ref.

## Privacy invariant

For `LOCAL_SENSITIVE` or `privacy=LOCAL_ONLY`:

- selected candidate locality must be LOCAL;
- every fallback locality must be LOCAL;
- cloud candidates remain visible only in rejection evidence with a privacy/policy reason;
- if no local eligible candidate exists, return unavailable.

No policy option may silently weaken this invariant.

## Orchestrator integration

CHAT 05 does not add a model call.

Integration proof uses CHAT 04's existing runtime resolver seam:

1. caller routes the TaskNode;
2. caller resolves an adapter for the selected route;
3. caller supplies `model_route_ref` to `executeMissionPlan(...)`;
4. resulting Execution Attempt preserves that ref.

This proves compatibility without coupling the router to runtime providers.

## Explicit non-goals

CHAT 05 does not:

- discover provider catalogs from the internet;
- store API keys;
- perform inference;
- determine connector authorization;
- auto-install local models;
- hardcode one vendor as globally preferred;
- retry model requests;
- add Cost Governor accounting;
- claim provider quality from synthetic fixtures.

## Acceptance

CHAT 05 is complete when tests prove:

1. FAST/REASONING/VISION/CODING/LOCAL_SENSITIVE route classes normalize correctly;
2. modality/context/reasoning constraints fail closed;
3. health DOWN/UNKNOWN cannot be selected;
4. finite budget rejects unknown price and over-budget choices;
5. latency target is enforced;
6. allow/deny provider policy is enforced;
7. fallback order is deterministic;
8. fallback=false produces none;
9. LOCAL_SENSITIVE cannot select or fall back to cloud;
10. no eligible candidate returns structured rejection evidence;
11. same facts produce same `model_route_ref`;
12. an orchestrated synthetic Attempt preserves the route ref.
