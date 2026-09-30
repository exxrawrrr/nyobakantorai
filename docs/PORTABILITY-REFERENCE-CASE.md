# Portability Reference Case — Siti v1

Status: **canonical input fixture for v0.5 reference-case portability**

Reference case:

```text
siti-portability-reference-v1
```

The fixture is intentionally small, deterministic, read-only, and local.

Its purpose is to prove that two runtime adapters receive the **same canonical worker/task/skill/policy/verification inputs** before their behavior is compared.

It does not prove cross-runtime parity by itself.

## Canonical source files

```text
benchmarks/portability/reference-case/
  source-artifact.json
  task.json
  expected-result.json
  verification-contract.json
  evidence-expectations.json
  manifest.json
```

The worker contract is not copied into the fixture. It is derived from:

```text
PORTABLE_EMPLOYEE_BY_ID.siti
```

in `lib/workforce.mjs`.

The execution policy is derived from:

```text
config/runtime-execution-policy.json
```

The five canonical skills are read as exact UTF-8 bytes from:

```text
skills/canonical/nyoba-independent-qa/SKILL.md
skills/canonical/nyoba-source-provenance/SKILL.md
skills/canonical/nyoba-verification-before-completion/SKILL.md
skills/canonical/nyoba-approval-and-evidence/SKILL.md
skills/canonical/nyoba-safe-tool-use/SKILL.md
```

## Reference task

Siti receives a local source artifact containing three claims:

1. the canonical worker is Siti;
2. the case performed an external write;
3. the case is already VERIFIED.

The source facts state:

- canonical worker = `siti`;
- risk = `READ_ONLY`;
- production repository mutated = `false`;
- external write performed = `false`;
- source status = `CANDIDATE`;
- evidence packet complete = `false`.

The canonical expected QA result is therefore:

- overall review state = `FAIL`;
- worker claim = `SUPPORTED`;
- external-write claim = `CONTRADICTED`;
- VERIFIED claim = `CONTRADICTED`;
- incomplete evidence remains an explicit residual limitation.

This case is intentionally not a reward-hacking “all PASS” fixture.

## Immutable core hashes

Current Chat 4 manifest:

```text
worker
3898c7e8b403a5f636105c654e03ec3b2cc28324b9bf86b2aeda0a3bf82edbb5

task
3d7787319fc5cdb0d3b680346e548e44988c95470695a749160c66f7ed7c78ba

execution policy
b2fbe176ee36fdd7d6e9eaa59a82c05956bc382937968a68e6c5116bd3b73396

source artifact
4166bccfefa2a5a577aac44ad4a65cea6ba12f3fd1b8db654ff4eba2a54d864b

expected result
73697c2c62d184ad7ae6befa37f035ac8ea90c18f822233486499ebc5c0bf9a3

verification contract
1a587c3b5d20f7f20a399f311279cb789eda18c42a27b985b82e42a397b3781d

evidence expectations
f7b7a5c2a582b96d9cfb97e42d3e74fec0f10e34ba7b83d2373c822dc2f87272

five-skill bundle
53939ea80223fe95ed6975ab12eafd5964798dce7e330cbc2a27e8b1489592f9
```

The aggregate canonical core bundle is:

```text
0c32963e42471e3ab14c74dc99f627cab254d45cfbc2de07bfe870abd7811fee
```

Canonical byte length:

```text
17502
```

## Runtime separation

Runtime-specific metadata is deliberately outside the core bundle:

```text
adapter_id
adapter_version
provider
runtime_ref
provider_version
```

Therefore a Hermes run and a Codex run may differ in runtime metadata while still being required to present:

```text
same reference_case_id
same component hashes
same core_bundle_sha256
same canonical core_input bytes
```

If any core byte changes, the comparison fails before behavioral evaluation.

## What is allowed to differ later

Allowed runtime differences remain adapter-level:

- runtime executable/invocation;
- provider/model version;
- temporary workspace path;
- runtime-local session metadata;
- raw native output before normalization;
- runtime-native activation/packaging needed to present the same canonical inputs.

The adapter must not silently change the canonical worker/task/skill/policy/verification content.

## Verification command

```bash
npm run portability:reference:check
npm run test:portability-reference
```

`portability:reference:check` derives all hashes again from repository source and compares them byte-for-byte with the checked-in manifest.

## Claim boundary

A matching bundle proves only:

> the two runtime runs were bound to the same canonical reference inputs.

It does **not** prove:

- that the runtimes behaved identically;
- that either runtime is generally portable;
- that a runtime really executed unless live evidence proves it;
- that signed/evidence artifacts prove external-world correctness;
- that the application contract is an OS/container sandbox.

Live behavioral proof belongs to the later Hermes/Codex execution phases.
