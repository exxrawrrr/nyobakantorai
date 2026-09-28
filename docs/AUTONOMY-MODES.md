# Autonomy modes

nyobakantorai describes three explicit modes. The public default is **GUARDED**.

| Mode | Intended behavior |
| --- | --- |
| OBSERVE | read, inspect, analyze, recommend |
| GUARDED | read, analyze, draft, preview, validate; high-impact writes wait for owner approval |
| DELEGATED | operate only inside a narrow policy envelope the user explicitly defined |

DELEGATED is not a global autonomous switch. It should name scope, targets, action classes, limits, required evidence, and stop/escalation conditions.

The repository never silently delegates ad spend, publishing, external messages, deployment, account changes, purchases, or destructive actions. New paid-media campaigns should prefer a paused/draft state until activation is explicitly authorized.
