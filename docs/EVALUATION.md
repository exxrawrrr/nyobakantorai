# Evaluation methodology

nyobakantorai treats evaluation as a product requirement, not a demo accessory.

## Deterministic evaluation layers

### Context guard

`benchmarks/context-compaction/` measures approximate token reduction, protected exact-atom recall, and required-fact recall. It does not claim live-model quality.

### Adversarial policy and failure recovery

`benchmarks/adversarial-policy/` attacks high-impact execution without approval, fake verifier identity, forged runtime state, out-of-role capability use, CONNECTED-without-evidence claims, and runtime timeout.

Release target:

    false_successes = 0
    false_success_rate = 0

### Evidence verifier

`packages/evidence-verifier/` rejects evidence packets containing wrong exact facts/numbers, missing required evidence, untrusted evidence schemes, stale/future-dated evidence, wrong artifacts, partial completion, unauthorized execution claims, non-Siti verifier claims, or prompt-injection signals.

A rejection does not prove the underlying work failed. It means the provided packet is insufficient to mark the work VERIFIED.

## Truth boundary

    configured != connected != authorized != executed != succeeded != verified

A provider connection is not evidence that an action occurred. An action receipt is not proof that the requested outcome is correct. A model saying done is not verification.

## Metrics for future live evaluations

Real-task evaluations should record task success, evidence completeness, false-success rate, human intervention, retries, latency/duration, cost, verification outcome, and recovery after provider/tool failure.

Context evaluations should additionally record token reduction, exact constraint retention, numeric fidelity, source-link fidelity, instruction fidelity, and downstream task success before vs after compilation.

## Provider/browser evaluation status

Playwright MCP, Browser Use, Cognee, LLMLingua, and other optional integrations remain evaluation candidates unless permanent documentation explicitly says otherwise.

Cataloged does not mean installed, connected, authorized, or production-approved.

Cross-harness, browser, memory-provider, and live-model evaluations must publish environment, version/commit, task set, failures, and claim limits before being treated as proven capabilities.

## Failure recovery

A recovery evaluation should show that the system returns to a truthful state after provider unavailable, timeout, malformed output, partial result, delayed approval, verifier rejection, or interrupted execution.

Expected flow:

    detect failure
    -> preserve evidence/state
    -> mark BLOCKED / WAITING / REJECTED as appropriate
    -> retry only when policy permits
    -> verify independently before closure
