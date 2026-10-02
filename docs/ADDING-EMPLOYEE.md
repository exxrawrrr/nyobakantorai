# Add employee #17

Use the safe generator in preview mode first:

```bash
node scripts/new-employee.mjs \
  --id=reno \
  --name="Reno" \
  --role="Ops Analyst" \
  --department="Operations" \
  --personality="practical,curious" \
  --expertise="operations,analysis" \
  --skills="nyoba-follow-up,nyoba-data-analysis" \
  --toolsets="skills,web,search,clarify" \
  --aliases="ops analyst,reno" \
  --capability-gap="Existing employees do not own the required regulated operations analysis workflow and its evidence standard."
```

Nothing is written without `--write`. The generator accepts only whitelisted fields, requires referenced canonical skills to exist, creates a `pending-original-art` visual placeholder, uses GUARDED approval defaults, forbids self-verification, and never generates credentials.

## Capability-gap rule

Before employee #17 can be added, document the missing role/capability with `--capability-gap`.

The gap must explain why the need is **not solved merely by attaching an existing reusable skill to one of the current 16 employees**. Generic reasons such as "more capacity" or "extra help" are rejected.

Recommended order:

1. inspect the Skills Store and current capability loops;
2. attach/version a reusable skill to an existing role when that solves the need;
3. preserve existing connector/tool permission boundaries;
4. add headcount only when a distinct role/capability gap remains.

After reviewing the preview, add `--write`. It appends the canonical registry and regenerates derived employee/profile files. Then run:

```bash
npm run workforce:check
npm run ready
```

For a reusable new procedure, create a canonical skill first under `skills/canonical/<skill>/SKILL.md`; do not duplicate procedures inside SOUL files.
