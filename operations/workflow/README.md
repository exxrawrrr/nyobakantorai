# Deterministic workflow router

A no-inference routing layer for the six example roles.

Supported categories:

| Category | Example role |
| --- | --- |
| coordination | Praroro |
| metrics | Paijo |
| engineering | Subagjo |
| strategy | Alex |
| creative | Sumiati |
| quality | Siti |

The router produces previews and manual handoff eligibility only. It does not create autonomous agent execution.

```bash
python operations/workflow/workflowctl.py route --category engineering --privacy INTERNAL --action DRAFT_ONLY
```

External writes, paid calls, account mutations, and confidential input are outside this workflow by default.
