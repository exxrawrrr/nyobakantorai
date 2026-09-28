# Threat model

nyobakantorai assumes model output, retrieved content, runtime status, and local task metadata can all be wrong or malicious.

## Assets to protect

- credentials and provider tokens
- private files and connected-account data
- client or personal information
- production systems and external accounts
- integrity of task state and evidence
- the distinction between proposed work and executed work

## Main threats

### Prompt or content injection
Files, web pages, emails, task bodies, and agent output may contain instructions that attempt to expand permission.

**Control:** retrieved content is data, not authority. Tool scope comes from the human request and runtime policy.

### False execution claims
An agent may say a message was sent, a deployment happened, or a test passed when it did not.

**Control:** external actions and VERIFIED state require concrete evidence or runtime receipts.

### Stale or forged runtime state
Imported task state may be old, fabricated, or attached to the wrong employee.

**Control:** read-only reconciliation checks stable runtime identifiers, assignee, status, and freshness. Unmatched claims are quarantined.

### Credential leakage
Secrets can leak through source files, examples, logs, screenshots, or generated artifacts.

**Control:** public-release scanning rejects sensitive filenames and common credential shapes. Runtime secrets are never required in the repository.

### Excessive tool privilege
A tool may technically allow more than the task needs.

**Control:** least privilege, read-only defaults, explicit write approval, bounded target, and rollback expectations.

### Supply-chain and provenance risk
Third-party assets or copied code can have unclear licensing.

**Control:** the public release includes only original project assets or material with an explicit compatible license/provenance.

## Non-goals

This project is not an operating-system sandbox, credential vault, multi-tenant authorization server, or guarantee that an external agent runtime is safe.
