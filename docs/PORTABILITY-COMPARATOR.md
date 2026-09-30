# Reference-Case Portability Comparator

Status: v0.5 Chat 7 — deterministic comparator contract

The comparator is runtime-neutral. It does not execute Hermes or Codex and it does not trust a runtime's own success label by itself.

It consumes two run records for the canonical Siti reference case and produces exactly one of four states:

- NOT_RUN
- PARTIAL
- PORTABILITY_CANDIDATE
- PORTABILITY_VERIFIED_FOR_REFERENCE_CASE

There is intentionally no global PORTABLE state.

## Required runtime pair

The reference pair is exactly Hermes + Codex. Two Hermes runs, two Codex runs, or an unknown provider cannot satisfy the comparator.

## Canonical core checks

Both records must bind to the checked-in reference case ID, the canonical core bundle SHA-256, and the exact component hash set from the Chat 4 manifest.

The two live records must also carry the same exact 40-character code commit. Two runtimes that are both wrong in the same way do not pass: component hashes are checked against the canonical manifest, not only against each other.

## Evidence checks

Each run must prove:

- adapter ID/version;
- runtime provider/ref;
- successful bounded execution and successful cleanup;
- raw and normalized result references;
- capabilities used;
- temporary workspace only;
- production_repo_changed=false;
- prohibited-action check PASS;
- install/login/account_mutation/external_write=false;
- core-bundle evidence binding;
- workspace before/after SHA-256;
- code commit;
- started/finished timestamps.

For LIVE_RUNTIME_EVIDENCE the code commit must be an exact 40-hex Git SHA.

## Behavioral comparison

The comparator evaluates the normalized output against the protected atoms in the canonical verification contract. For the current Siti case this includes FAIL overall review state, the expected verdict and evidence path for all three claims, and an explicit residual limitation that preserves the incomplete-evidence truth.

Hermes and Codex must agree with each other and with the canonical expected atoms. Agreement on the same wrong answer is rejected.

## Provenance and state transitions

FIXTURE_EVIDENCE always blocks a parity claim and yields PARTIAL, even if every atom and hash matches.

Two complete LIVE_RUNTIME_EVIDENCE records with protected atoms correct but independent verification not yet complete may reach PORTABILITY_CANDIDATE. Candidate is not a portability claim.

PORTABILITY_VERIFIED_FOR_REFERENCE_CASE is possible only when both runs are live, evidence-complete, bound to identical canonical inputs and code commit, protected atoms are correct, prohibited-action/workspace checks pass, and each record carries an independent PASS verification with an evidence reference.

A verifier FAIL returns PARTIAL rather than candidate.

## CLI

Use:

npm run portability:compare -- <hermes-run.json> <codex-run.json>

The CLI exits successfully only for PORTABILITY_VERIFIED_FOR_REFERENCE_CASE. NOT_RUN, PARTIAL, and PORTABILITY_CANDIDATE fail closed with a nonzero exit code.

## Claim boundary

Chat 7 proves comparator logic and state gating under deterministic adapter fixture outputs. It does not create live runtime evidence and therefore does not upgrade the repository's portability claim.
