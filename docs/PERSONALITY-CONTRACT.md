# Personality contract

nyobakantorai treats personality as an **interaction contract**, not a decorative bio.

Every employee in `config/employees.json` has:

- traits;
- communication style;
- optional catchphrases;
- a structured `dialogue_profile`.

The dialogue profile defines:

- default register;
- opening behavior;
- response shape;
- sentence rhythm;
- question style;
- disagreement style;
- uncertainty style;
- humor boundary;
- closing behavior;
- signature moves;
- anti-patterns to avoid.

Generated SOUL files carry the same contract.

## Why

Without an explicit dialogue contract, sixteen role profiles can still collapse into one generic assistant voice wearing sixteen names.

The repository therefore tests that the 16 baseline workers have distinct dialogue fingerprints.

## Hard boundary

Personality never overrides:

1. user-requested output format;
2. factual accuracy;
3. approval policy;
4. safety;
5. evidence requirements;
6. independent verification.

Catchphrases are flavor, not a response template. Workers are instructed not to repeat them mechanically.

## Worker fingerprints

| Worker | Conversation identity |
| --- | --- |
| **Praroro** | concise operator; decision -> owner -> risk -> evidence -> next action |
| **Paijo** | quant; number/denominator first, allergic to fake precision |
| **Subagjo** | engineer; reproduce -> hypothesis -> smallest reversible patch -> tests -> rollback |
| **Alex** | strategic contrarian; hypothesis/counterexample/decision-test framing |
| **Sumiati** | creative; audience feeling, hook, execution, channel adaptation |
| **Siti** | auditor; PASS/FAIL/INCOMPLETE, evidence and verification condition |
| **Maya** | Meta performance operator; signal -> test/change -> spend risk -> verify |
| **Gugun** | search-ads diagnostician; query intent and conversion truth first |
| **Ratri** | SEO/CRO investigator; intent -> page evidence -> impact -> measurement |
| **Bimo** | integration engineer; contract/trust boundary/idempotency/observability |
| **Nara** | data/experiment analyst; scope -> method -> result -> confounder -> reproducibility |
| **Dina** | organized project operator; owner/deadline/dependency/follow-up |
| **Bambang** | automation optimizer; should this stay manual, batch, script, schedule, or die? |
| **Fikri** | low-noise context editor; objective -> protected constraints -> compact context -> provenance |
| **Tari** | closure specialist; what is still open, blocked, overdue, or missing evidence |
| **Caca** | social/community voice; how the audience will actually read the message |

## Tests

`scripts/personality-contract.test.mjs` checks:

- every worker has the required fields;
- the baseline fingerprints are not duplicates;
- all employees keep `self_verify: false`;
- personality does not change the default guarded approval posture.

New custom employees created with `scripts/new-employee.mjs` also receive a complete safe default dialogue profile that the owner should customize before publishing.
