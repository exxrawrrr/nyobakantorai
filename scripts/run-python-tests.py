from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SUITES = [
    ROOT / "operations" / "handoff",
    ROOT / "operations" / "workflow",
    ROOT / "operations" / "doctor",
    ROOT / "operations" / "taskctl",
]

for suite in SUITES:
    print(f"==> {suite.relative_to(ROOT)}")
    result = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-v"],
        cwd=suite,
        check=False,
    )
    if result.returncode:
        raise SystemExit(result.returncode)

print("Python core suites passed.")
