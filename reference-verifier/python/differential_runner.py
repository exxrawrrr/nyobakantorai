from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

from verifier import verify_receipt_packet


def _sorted_strings(values):
    return sorted(str(value) for value in values)


def evaluate_case(case):
    result = verify_receipt_packet(case["packet"])
    return {
        "id": case["id"],
        "accept": result["ok"] is True,
        "packet_reason_codes": _sorted_strings(
            item["code"] for item in result["reasons"]
        ),
        "receipt_reason_sets": [
            _sorted_strings(check["reasons"])
            for check in result["signed_receipt_checks"]
        ],
    }


def evaluate_corpus(corpus):
    return {
        "schema": 1,
        "corpus_id": corpus["id"],
        "cases": [evaluate_case(case) for case in corpus["cases"]],
    }


def main(argv=None):
    args = list(sys.argv[1:] if argv is None else argv)
    corpus_path = Path(args[0] if args else "benchmarks/verifier-differential/corpus.json")
    raw = corpus_path.read_bytes()
    corpus = json.loads(raw.decode("utf-8"))
    output = evaluate_corpus(corpus)
    output["corpus_sha256"] = hashlib.sha256(raw).hexdigest()
    json.dump(output, sys.stdout, ensure_ascii=False, sort_keys=True, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
