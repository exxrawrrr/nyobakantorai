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
  --aliases="ops analyst,reno"
```

Nothing is written without `--write`. The generator accepts only whitelisted fields, requires referenced canonical skills to exist, creates a `pending-original-art` visual placeholder, uses GUARDED approval defaults, forbids self-verification, and never generates credentials.

After reviewing the preview, add `--write`. It appends the canonical registry and regenerates derived employee/profile files. Then run:

```bash
npm run workforce:check
npm run ready
```

For a reusable new procedure, create a canonical skill first under `skills/canonical/<skill>/SKILL.md`; do not duplicate procedures inside SOUL files.
