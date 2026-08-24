from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np


SAMPLE_TEXTS = [
    "Senior Backend Engineer with 5+ years of experience in Python, Django, and PostgreSQL.",
    "We are looking for a Data Scientist skilled in machine learning, pandas, and scikit-learn.",
    "Remote Frontend Developer role: React, TypeScript, and modern CSS required.",
    "Product Manager with a background in B2B SaaS and agile methodologies.",
    "DevOps Engineer: AWS, Kubernetes, Terraform, and CI/CD pipelines. 3+ years preferred.",
    "Café project coordinator needed — résumé screening & naïve Bayes email triage.",
]

THIS_DIR = Path(__file__).resolve().parent


def encode_python(max_tokens: int) -> dict:
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    model.max_seq_length = max_tokens

    pooling_mode = "unknown"
    try:
        for module in model._modules.values():
            if module.__class__.__name__ == "Pooling":
                
                mode = getattr(module, "pooling_mode", None)
                if isinstance(mode, str) and mode:
                    pooling_mode = mode
                
                elif getattr(module, "pooling_mode_mean_tokens", False):
                    pooling_mode = "mean"
                elif getattr(module, "pooling_mode_cls_token", False):
                    pooling_mode = "cls"
                elif getattr(module, "pooling_mode_max_tokens", False):
                    pooling_mode = "max"
    except Exception:
        pass

    embeddings = model.encode(
        SAMPLE_TEXTS,
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    return {
        "pooling": pooling_mode,
        "normalize": True,
        "max_tokens_configured": model.max_seq_length,
        "embeddings": embeddings.tolist(),
    }


def encode_js(node_cwd: Path) -> dict:
    samples_path = THIS_DIR / "_parity_samples.json"
    samples_path.write_text(json.dumps(SAMPLE_TEXTS), encoding="utf-8")

    script_path = THIS_DIR / "js_encode_samples.mjs"
    if not script_path.exists():
        raise FileNotFoundError(f"Missing {script_path}. It must ship alongside this script.")

    try:
        proc = subprocess.run(
            ["node", str(script_path), str(samples_path)],
            cwd=str(node_cwd),
            capture_output=True,
            text=True,
            timeout=300,
        )
    except FileNotFoundError as e:
        raise RuntimeError(
            "Node.js not found on PATH. Install Node to run the JS side of parity verification."
        ) from e
    finally:
        samples_path.unlink(missing_ok=True)

    if proc.returncode != 0:
        raise RuntimeError(f"JS encoding failed (exit {proc.returncode}):\n{proc.stderr}")

    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"JS side did not return valid JSON on stdout:\n{proc.stdout}\n{proc.stderr}") from e


def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    a = a / (np.linalg.norm(a) + 1e-12)
    b = b / (np.linalg.norm(b) + 1e-12)
    return float(np.dot(a, b))


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Python/JS embedding parity.")
    parser.add_argument("--threshold", type=float, default=0.999)
    parser.add_argument("--max-tokens", type=int, default=256)
    parser.add_argument(
        "--node-cwd", type=Path, default=THIS_DIR,
        help="Directory to run node from (must have @xenova/transformers installed there).",
    )
    args = parser.parse_args()

    print("== Embedding parity verification ==")
    print("Python model: sentence-transformers/all-MiniLM-L6-v2")
    print("JS model:     Xenova/all-MiniLM-L6-v2 (ONNX port)")
    print()

    try:
        py = encode_python(args.max_tokens)
    except Exception as e:
        print(f"ERROR: Python-side encoding failed: {e}", file=sys.stderr)
        return 2

    try:
        js = encode_js(args.node_cwd)
    except Exception as e:
        print(f"ERROR: JS-side encoding failed: {e}", file=sys.stderr)
        return 2

    config_ok = True
    if py["pooling"] != js["pooling"]:
        print(f"CONFIG MISMATCH: pooling — python={py['pooling']!r} vs js={js['pooling']!r}", file=sys.stderr)
        config_ok = False
    if py["normalize"] != js["normalize"]:
        print(f"CONFIG MISMATCH: normalize — python={py['normalize']!r} vs js={js['normalize']!r}", file=sys.stderr)
        config_ok = False
    if py["max_tokens_configured"] != js["max_tokens_configured"]:
        print(
            f"CONFIG MISMATCH: max_tokens — python={py['max_tokens_configured']!r} "
            f"vs js={js['max_tokens_configured']!r}",
            file=sys.stderr,
        )
        config_ok = False

    if not config_ok:
        print(
            "\nFAILED: configuration diverges between Python and JS pipelines. "
            "Fix pooling/normalize/max_tokens to match before trusting similarity scores.",
            file=sys.stderr,
        )
        return 1

    py_embs = np.array(py["embeddings"])
    js_embs = np.array(js["embeddings"])

    if py_embs.shape != js_embs.shape:
        print(f"FAILED: embedding shapes differ — python={py_embs.shape} vs js={js_embs.shape}", file=sys.stderr)
        return 1

    print(f"{'idx':<5} {'cosine_sim':>10}  sample")
    worst = 1.0
    failures = []
    for i, (text, pv, jv) in enumerate(zip(SAMPLE_TEXTS, py_embs, js_embs)):
        sim = cosine_sim(pv, jv)
        worst = min(worst, sim)
        status = "OK" if sim >= args.threshold else "FAIL"
        print(f"[{i}] {sim:.6f}  {status}  \"{text[:50]}...\"")
        if sim < args.threshold:
            failures.append((i, sim))

    print()
    if failures:
        print(
            f"FAILED: {len(failures)}/{len(SAMPLE_TEXTS)} sample(s) below threshold {args.threshold}.",
            file=sys.stderr,
        )
        print(
            "Likely causes: quantized ONNX weights on the JS side (check `quantized: false` in "
            "js_encode_samples.mjs vs the actual frontend call), a tokenizer vocab/version mismatch, "
            "or a pooling/normalization bug.",
            file=sys.stderr,
        )
        return 1

    print(
        f"PASSED: all {len(SAMPLE_TEXTS)} samples >= {args.threshold} cosine similarity "
        f"(worst case: {worst:.6f}). pooling={py['pooling']}, normalize={py['normalize']}, "
        f"max_tokens={py['max_tokens_configured']} match on both sides."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
