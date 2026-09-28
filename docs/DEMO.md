# Deterministic demo

The public demo proves the task/evidence lifecycle without contacting a model, service, account, or production system.

Run:

```bash
npm run demo
```

The script creates five synthetic work items:

1. Praroro coordinates.
2. Alex researches.
3. Sumiati drafts communication.
4. Subagjo builds a local prototype.
5. Paijo defines metrics.
6. Siti independently verifies each completed item.

Every task must travel through REQUESTED → IN_PROGRESS → COMPLETED → VERIFIED, and VERIFIED requires a Siti-authored evidence reference.

The demo uses `demo://` references intentionally. They are synthetic evidence markers for testing the state machine, not claims that external work occurred.
