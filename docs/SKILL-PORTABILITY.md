# Skill portability

nyobakantorai keeps Hermes as the reference runtime, but the canonical skills under `skills/hermes-custom/*/SKILL.md` now follow the **Agent Skills core SKILL.md format** reviewed from the pinned `agentskills/agentskills` specification.

## What is verified

The repository validates all canonical skills for:

- a `SKILL.md` file in a named skill directory;
- YAML frontmatter;
- `name` matching the parent directory;
- lowercase/hyphen naming constraints;
- required non-empty `description`;
- Agent Skills top-level fields only;
- string-valued custom `metadata`;
- bounded `compatibility`;
- non-empty Markdown instruction body.

Run:

```bash
npm run test:skill-format
```

The validator is implemented in `scripts/validate-agent-skills.py` and uses the already-pinned PyYAML development dependency.

## Namespaced project metadata

Agent Skills allows custom metadata as a string-to-string map.

nyobakantorai stores project-specific fields under namespaced keys:

```yaml
metadata:
  nyoba-version: "1.0.0"
  nyoba-author: "nyobakantorai"
  nyoba-platforms: "windows,linux,macos"
  nyoba-hermes-tags: "nyobakantorai,agents,workflow"
  nyoba-provenance-mode: "recreated"
  nyoba-source-ids: "superpowers,ecc"
```

Not every skill has provenance fields. Only skills recreated/adapted from upstream concepts are allowed to declare them.

The expected derived-skill set is machine-readable in:

```text
config/skill-provenance.json
```

`scripts/upstream-provenance.test.mjs` requires the catalog and frontmatter to match exactly and rejects source IDs whose upstream use mode is excluded from derivation.

## What is not claimed yet

Core-format conformance is **not** the same as proven behavioral compatibility across every skills-capable product.

Different clients may vary in:

- activation heuristics;
- optional tool fields;
- resource loading;
- execution sandbox;
- MCP/tool availability;
- system instruction precedence;
- memory behavior.

Therefore the project currently claims:

> Agent Skills core-format conformance for canonical skill packaging.

It does **not** yet claim:

> identical execution behavior across all Agent Skills clients.

Cross-harness compatibility remains a roadmap item until representative clients are tested.

## Hermes packaging

Each employee distribution under `hermes-profiles/<employee>/` receives exact copies of its assigned canonical skills.

`workforce:check` and the public-release audit reject packaged-skill drift.

Standalone employee ZIPs therefore carry the same canonical skill text and provenance metadata as the full workforce.
