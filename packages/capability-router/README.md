# Capability router

Provider-neutral, dependency-free negotiation and authorization logic for nyobakantorai external capabilities.

It deliberately does **not** contain provider credentials or execute provider actions. A provider adapter supplies a bounded snapshot; the router validates evidence, resolves connection state, and applies autonomy/approval policy.

Key invariants:

- `CONNECTED` requires an evidence reference.
- Missing capability evidence fails closed to `NOT_CONNECTED`.
- `OBSERVE` never authorizes high-impact writes.
- `GUARDED` requires explicit owner approval for high-impact capabilities.
- `DELEGATED` only authorizes capabilities explicitly inside the delegated envelope.
- Provider-specific implementations remain separate and can be proprietary or open source.
