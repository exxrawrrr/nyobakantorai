from __future__ import annotations

from pathlib import Path
import re
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = ROOT / "skills" / "hermes-custom"
ALLOWED_TOP_LEVEL = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def parse_skill(path: Path):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError("SKILL.md must start with YAML frontmatter")
    parts = text.split("---", 2)
    if len(parts) != 3:
        raise ValueError("SKILL.md frontmatter is not closed")
    frontmatter = yaml.safe_load(parts[1]) or {}
    body = parts[2].strip()
    if not isinstance(frontmatter, dict):
        raise ValueError("frontmatter must be a YAML mapping")
    return text, frontmatter, body


def validate_skill(directory: Path):
    path = directory / "SKILL.md"
    failures = []
    warnings = []
    if not path.is_file():
        return [f"{directory.name}: missing SKILL.md"], warnings

    try:
        text, meta, body = parse_skill(path)
    except Exception as exc:
        return [f"{directory.name}: {exc}"], warnings

    unknown = sorted(set(meta) - ALLOWED_TOP_LEVEL)
    if unknown:
        failures.append(f"{directory.name}: unsupported Agent Skills top-level fields: {', '.join(unknown)}")

    name = meta.get("name")
    if not isinstance(name, str) or not name:
        failures.append(f"{directory.name}: name must be a non-empty string")
    else:
        if len(name) > 64:
            failures.append(f"{directory.name}: name exceeds 64 characters")
        if not NAME_RE.fullmatch(name) or "--" in name or name.startswith("-") or name.endswith("-"):
            failures.append(f"{directory.name}: invalid Agent Skills name: {name}")
        if name != directory.name:
            failures.append(f"{directory.name}: frontmatter name must match parent directory")

    description = meta.get("description")
    if not isinstance(description, str) or not description.strip():
        failures.append(f"{directory.name}: description must be a non-empty string")
    elif len(description) > 1024:
        failures.append(f"{directory.name}: description exceeds 1024 characters")

    if "license" in meta and (not isinstance(meta["license"], str) or not meta["license"].strip()):
        failures.append(f"{directory.name}: license must be a non-empty string when provided")

    if "compatibility" in meta:
        compatibility = meta["compatibility"]
        if not isinstance(compatibility, str) or not compatibility.strip():
            failures.append(f"{directory.name}: compatibility must be a non-empty string")
        elif len(compatibility) > 500:
            failures.append(f"{directory.name}: compatibility exceeds 500 characters")

    if "allowed-tools" in meta and not isinstance(meta["allowed-tools"], str):
        failures.append(f"{directory.name}: allowed-tools must be a space-separated string")

    metadata = meta.get("metadata", {})
    if not isinstance(metadata, dict):
        failures.append(f"{directory.name}: metadata must be a mapping")
    else:
        for key, value in metadata.items():
            if not isinstance(key, str):
                failures.append(f"{directory.name}: metadata keys must be strings")
            if not isinstance(value, str):
                failures.append(f"{directory.name}: metadata[{key!r}] must be a string")

    if not body:
        failures.append(f"{directory.name}: Markdown instruction body is empty")

    line_count = len(text.splitlines())
    if line_count > 500:
        warnings.append(f"{directory.name}: SKILL.md is {line_count} lines; Agent Skills recommends <500")

    return failures, warnings


def main() -> int:
    if not SKILLS_ROOT.is_dir():
        print(f"Missing skills directory: {SKILLS_ROOT}", file=sys.stderr)
        return 1

    directories = sorted(path for path in SKILLS_ROOT.iterdir() if path.is_dir())
    failures = []
    warnings = []
    for directory in directories:
        skill_failures, skill_warnings = validate_skill(directory)
        failures.extend(skill_failures)
        warnings.extend(skill_warnings)

    for warning in warnings:
        print(f"WARN  {warning}")

    if failures:
        print("Agent Skills validation failed:", file=sys.stderr)
        for failure in failures:
            print(f"FAIL  {failure}", file=sys.stderr)
        return 1

    print(f"Agent Skills core-format validation passed for {len(directories)} canonical skills.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
