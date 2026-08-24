"""
generate_embeddings.py

One-time, offline step. Reads jobs_data_clean.json, computes a semantic
embedding for every job posting using sentence-transformers'
all-MiniLM-L6-v2 (free, local, 384-dim, no API key), and writes
jobs_with_embeddings.json — the same job records plus an `embedding`
field per job.

This output file is committed into the Next.js project as static data.
At runtime, the app embeds the user's CV with the JS port of the same
model (@xenova/transformers) so both vectors live in the same space,
and does an in-memory cosine-similarity search — no vector DB needed
for 382 records. Run verify_embedding_parity.py after any dependency
bump on either side to confirm the two still agree.

Also writes jobs_with_embeddings.metadata.json alongside the main output
(model name/revision, dim, pooling, normalization, max tokens, generation
timestamp) so downstream code can detect stale/mismatched embeddings if
the model ever changes.

Usage:
    pip install -r requirements.txt
    python generate_embeddings.py
"""

import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer

MODEL_NAME = "all-MiniLM-L6-v2"
INPUT_PATH = Path("jobs_data_clean.json")
OUTPUT_PATH = Path("jobs_with_embeddings.json")
METADATA_PATH = Path("jobs_with_embeddings.metadata.json")

EMBEDDING_DIM = 384
MAX_TOKENS = 256  # all-MiniLM-L6-v2's hard token limit

# Keep the embedded/committed JSON file a reasonable size — these are
# separate, character-based truncations of the *display* fields, unrelated
# to the tokenizer-aware truncation applied to full_text before encoding
# below (full_text is what actually goes into the model).
MAX_FIELD_CHARS = 500


def truncate(text, max_chars=MAX_FIELD_CHARS):
    if not text:
        return text
    return text[:max_chars]


# ---------------------------------------------------------------------------
# Encoding cleanup: full_text sometimes contains mojibake left over from the
# scraping step (literal "????" runs from lossy replacement, or mis-decoded
# UTF-8 bytes). Detect and repair before it gets embedded as if it were
# meaningful signal.
# ---------------------------------------------------------------------------

_MOJIBAKE_PATTERNS = [
    re.compile(r"\?{3,}"),                # literal "????" runs from lossy replacement
    re.compile(r"\ufffd{2,}"),             # repeated U+FFFD replacement characters
    re.compile(r"(â€[€™œ\x9d\x94\x93˜¦])"),  # UTF-8 bytes misread as Latin-1/CP1252
    re.compile(r"(Ã[¢©¨¯ ])"),
]


def detect_mojibake(text):
    if not text:
        return False
    if any(p.search(text) for p in _MOJIBAKE_PATTERNS):
        return True
    if len(text) > 20:
        bad = sum(1 for ch in text if unicodedata.category(ch) in ("Cc", "Cn") and ch not in "\n\r\t")
        if bad / len(text) > 0.02:
            return True
    return False


def clean_text(text):
    """Conservative repair: strip known-garbage runs and unassigned/control
    characters. Doesn't try to guess the original bytes (e.g. re-decode as
    Latin-1) since that guess is wrong as often as it's right and can
    corrupt text that was already clean."""
    original = text
    cleaned = re.sub(r"\?{3,}", " ", text)
    cleaned = "".join(
        ch for ch in cleaned
        if unicodedata.category(ch) not in ("Cc", "Cn") or ch in "\n\r\t "
    )
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    still_bad = detect_mojibake(cleaned) or (len(original) > 0 and len(cleaned) < 0.5 * len(original))
    return cleaned, still_bad


def clean_full_text_fields(jobs, field="full_text"):
    """Mutates jobs in place. Returns (flagged_ids, still_flagged_ids)."""
    flagged_ids, still_flagged_ids = [], []
    for job in jobs:
        text = job.get(field, "") or ""
        if detect_mojibake(text):
            flagged_ids.append(job["id"])
            cleaned, still_bad = clean_text(text)
            job[field] = cleaned
            if still_bad:
                still_flagged_ids.append(job["id"])
    return flagged_ids, still_flagged_ids


# ---------------------------------------------------------------------------
# Tokenizer-aware truncation: model.encode() would otherwise silently
# truncate full_text at MAX_TOKENS internally with no record of it. Do it
# explicitly first, with the model's own tokenizer (not a character-count
# heuristic — token-per-char ratio varies too much across postings), so we
# know exactly what was dropped.
# ---------------------------------------------------------------------------

def truncate_for_model(jobs, tokenizer, field="full_text", max_tokens=MAX_TOKENS):
    """Mutates jobs in place. Returns (truncated_ids, tokens_dropped_total, max_dropped_single)."""
    truncated_ids = []
    tokens_dropped_total = 0
    max_dropped_single = 0
    for job in jobs:
        text = job.get(field, "") or ""
        ids = tokenizer.encode(text, add_special_tokens=False)
        if len(ids) > max_tokens:
            dropped = len(ids) - max_tokens
            job[field] = tokenizer.decode(ids[:max_tokens], skip_special_tokens=True)
            truncated_ids.append(job["id"])
            tokens_dropped_total += dropped
            max_dropped_single = max(max_dropped_single, dropped)
    return truncated_ids, tokens_dropped_total, max_dropped_single


# ---------------------------------------------------------------------------
# Output validation: fail loudly instead of committing broken embeddings.
# ---------------------------------------------------------------------------

class EmbeddingValidationError(Exception):
    pass


def validate_embeddings(records, dim=EMBEDDING_DIM, norm_tol=1e-2):
    wrong_dim, nan_or_inf, all_zero, not_unit_norm = [], [], [], []
    seen_hashes, duplicates = {}, []

    for rec in records:
        rid = rec["id"]
        vec = np.asarray(rec["embedding"], dtype=np.float64)

        if vec.shape != (dim,):
            wrong_dim.append((rid, vec.shape))
            continue
        if not np.all(np.isfinite(vec)):
            nan_or_inf.append(rid)
            continue

        norm = float(np.linalg.norm(vec))
        if np.isclose(norm, 0.0, atol=1e-8):
            all_zero.append(rid)
            continue
        if abs(norm - 1.0) > norm_tol:
            not_unit_norm.append((rid, norm))

        h = np.round(vec, 6).tobytes()
        if h in seen_hashes:
            duplicates.append((seen_hashes[h], rid))
        else:
            seen_hashes[h] = rid

    if wrong_dim or nan_or_inf or all_zero or not_unit_norm or duplicates:
        lines = ["Embedding validation FAILED:"]
        if wrong_dim:
            lines.append(f"  wrong dimension, expected {dim} ({len(wrong_dim)}): {wrong_dim[:10]}")
        if nan_or_inf:
            lines.append(f"  NaN/Inf values ({len(nan_or_inf)}): {nan_or_inf[:10]}")
        if all_zero:
            lines.append(f"  all-zero vectors ({len(all_zero)}): {all_zero[:10]}")
        if not_unit_norm:
            lines.append(f"  non-unit norm, tol={norm_tol} ({len(not_unit_norm)}): {not_unit_norm[:10]}")
        if duplicates:
            lines.append(f"  duplicate embeddings ({len(duplicates)} pairs): {duplicates[:10]}")
        raise EmbeddingValidationError("\n".join(lines))


def main():
    if not INPUT_PATH.exists():
        sys.exit(f"Missing {INPUT_PATH}. Place the scraped jobs file next to this script.")

    with open(INPUT_PATH, encoding="utf-8") as f:
        jobs = json.load(f)

    print(f"Loaded {len(jobs)} job postings from {INPUT_PATH}")

    # --- encoding cleanup, before anything else touches full_text ---
    flagged_ids, still_flagged_ids = clean_full_text_fields(jobs)
    print(
        f"Encoding cleanup: {len(flagged_ids)} record(s) flagged for mojibake/corrupted text "
        f"({len(flagged_ids) - len(still_flagged_ids)} auto-cleaned, {len(still_flagged_ids)} still flagged)."
    )
    if flagged_ids:
        print(f"  flagged IDs: {flagged_ids}")
    if still_flagged_ids:
        print(f"  WARNING — still corrupted after cleaning, will embed with degraded signal: {still_flagged_ids}")

    print(f"Loading model '{MODEL_NAME}' (downloads once, ~80MB, then cached locally)...")
    model = SentenceTransformer(MODEL_NAME)
    model.max_seq_length = MAX_TOKENS

    # --- tokenizer-aware truncation ---
    truncated_ids, tokens_dropped_total, max_dropped_single = truncate_for_model(jobs, model.tokenizer)
    print(
        f"Truncation: {len(truncated_ids)}/{len(jobs)} record(s) exceeded {MAX_TOKENS} tokens "
        f"(total tokens dropped: {tokens_dropped_total}, worst single record: {max_dropped_single})."
    )
    if truncated_ids:
        print(f"  truncated IDs: {truncated_ids}")

    # Embed on the full_text field (title + company + level + skills +
    # description + requirements) — this is what best captures the
    # semantic content of each posting for CV matching.
    texts = [job.get("full_text", "") for job in jobs]

    print("Encoding job postings...")
    embeddings = model.encode(
        texts,
        batch_size=32,
        show_progress_bar=True,
        normalize_embeddings=True,  # so cosine similarity == dot product
    )

    out = []
    for job, emb in zip(jobs, embeddings):
        record = dict(job)  # shallow copy, keep all original fields
        record["description_clean"] = truncate(record.get("description_clean"))
        record["requirements_clean"] = truncate(record.get("requirements_clean"))
        record["embedding"] = emb.tolist()
        out.append(record)

    # --- validate before writing anything ---
    try:
        validate_embeddings(out)
    except EmbeddingValidationError as e:
        sys.exit(f"\n{e}\n\nRefusing to write {OUTPUT_PATH} — fix the offending records above and re-run.")
    print(f"Validation passed: all {len(out)} embeddings are {EMBEDDING_DIM}-dim, unit-norm, finite, unique.")

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f)

    # --- model version metadata sidecar ---
    revision = None
    try:
        revision = model._first_module().auto_model.config._commit_hash
    except Exception:
        pass

    import sentence_transformers as st
    import torch

    metadata = {
        "model_name": MODEL_NAME,
        "model_revision": revision or "unknown",
        "embedding_dim": EMBEDDING_DIM,
        "pooling": "mean",
        "normalization": "l2",
        "max_tokens": MAX_TOKENS,
        "record_count": len(out),
        "sentence_transformers_version": st.__version__,
        "torch_version": torch.__version__,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "is_sandbox_demo": False,
    }
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    size_mb = OUTPUT_PATH.stat().st_size / (1024 * 1024)
    print(f"Wrote {len(out)} records with {len(out[0]['embedding'])}-dim embeddings "
          f"to {OUTPUT_PATH} ({size_mb:.1f} MB)")
    print(f"Wrote model metadata to {METADATA_PATH} — downstream code can check this to "
          f"detect stale/mismatched embeddings if the model changes later.")


if __name__ == "__main__":
    main()
