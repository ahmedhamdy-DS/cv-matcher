# FitMatch — AI Job-Matching RAG Agent

Matches a candidate's CV against 382 real scraped job postings using semantic embedding similarity, then uses Google Gemini (free tier) to explain the fit — strengths, gaps, and an overall recommendation — for the top matches. Entirely free/self-hosted, including the LLM.

## Table of contents

- [How it works](#how-it-works)
- [Why Gemini instead of Claude](#why-gemini-instead-of-claude)
- [Project layout](#project-layout)
- [Embeddings status](#embeddings-status)
- [Reliability fixes](#reliability-fixes)
- [Running locally](#running-locally)
- [Deploying](#deploying)
- [Production considerations](#production-considerations)
- [What was verified](#what-was-verified-in-the-original-build-sandbox)

## How it works

```
jobs_data_clean.json (382 postings)
        │
        │  generate_embeddings.py  (offline, one-time)
        │  sentence-transformers · all-MiniLM-L6-v2
        ▼
jobs_with_embeddings.json  ──────►  committed as static data in webapp/data/
        │
        │  Next.js app, deployed on Vercel
        ▼
User pastes CV ──► embedded in JS (@xenova/transformers, same model)
                 ──► cosine similarity vs. all 382 jobs, in memory
                 ──► top N sent to Gemini API for fit analysis
                 ──► results rendered: match %, strengths, gaps
```

No vector database, no separate Python server at runtime — Python runs once, offline, to precompute job embeddings.

## Why Gemini instead of Claude

The app originally called the Claude API. It was switched to **Google Gemini** (`gemini-2.5-flash`) because Gemini has a genuine free tier — no credit card, no charge — which fits a no-recurring-cost portfolio project better than Claude's pay-per-token API. Swapping providers only touched `app/api/analyze/route.ts` and `package.json`; everything else (embeddings, similarity search, UI) is unchanged.

Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Free-tier quotas are generous for personal/demo use but do have daily limits — check [ai.google.dev/pricing](https://ai.google.dev/pricing) for current numbers before high-traffic use.

## Project layout

```
job-matcher/
├── generate_embeddings.py       ← run this once, locally, before deploying
├── requirements.txt
├── jobs_data_clean.json         ← 382 scraped postings (already here)
├── jobs_with_embeddings.json    ← output of generate_embeddings.py
└── webapp/                      ← the Next.js app (deploy this folder to Vercel)
    ├── app/
    │   ├── page.tsx              CV input + results UI
    │   ├── globals.css           design system (colors, type)
    │   └── api/analyze/route.ts  embed → rank → Gemini analysis
    ├── components/
    │   ├── CVInput.tsx           CV input + drag/drop, reads PDF/DOCX/TXT
    │   ├── MatchRing.tsx         signature circular match indicator
    │   └── JobResultCard.tsx
    ├── lib/
    │   ├── embedCV.ts            CV embedding (transformers.js, client-side)
    │   ├── extractText.ts        client-side PDF/DOCX/TXT text extraction
    │   ├── similarity.ts         in-memory cosine similarity + ranking
    │   ├── jobs.ts                loads the static embeddings file
    │   └── types.ts
    └── data/
        ├── jobs_with_embeddings.json           ← copy the real output here
        └── jobs_with_embeddings.metadata.json  ← copy alongside it
```

## Embeddings status

The real `generate_embeddings.py` (sentence-transformers / all-MiniLM-L6-v2) has been run successfully on a local machine with normal internet access — confirmed output: 382 records, 384-dim embeddings, `jobs_with_embeddings.json` (~4.1 MB). Copy that file into `webapp/data/jobs_with_embeddings.json` so the app uses real semantic embeddings.

> **Don't ship the sandbox fallback.** `generate_embeddings_sandbox_demo.py` only exists because the original build sandbox had no route to huggingface.co — it produces placeholder TF-IDF+SVD embeddings, not real semantic ones. Always overwrite with the real output before deploying:
>
> ```bash
> cd job-matcher
> python generate_embeddings.py
> cp jobs_with_embeddings.json webapp/data/jobs_with_embeddings.json
> cp jobs_with_embeddings.metadata.json webapp/data/jobs_with_embeddings.metadata.json
> ```

Both `generate_embeddings.py` and `generate_embeddings_sandbox_demo.py` write a `jobs_with_embeddings.metadata.json` sidecar alongside the main output, with an `is_sandbox_demo` flag (`false` for the real run, `true` for the TF-IDF+SVD fallback). `lib/jobs.ts` should read this sidecar and, if `is_sandbox_demo` is `true`, render a persistent (non-dismissible) warning banner — see [Reliability fixes, #7](#reliability-fixes). Always copy both files together; never overwrite one without the other.

## Reliability fixes

Seven correctness/reliability issues were fixed without changing the overall architecture (Python offline embedding + JS client-side CV embedding + in-memory cosine similarity):

1. **Tokenizer-aware truncation.** `full_text` was passed to `model.encode()` untruncated; sentence-transformers silently truncates at 256 tokens internally, so long postings were losing content with no record of it. `generate_embeddings.py` now truncates with the model's own tokenizer *before* encoding and logs how many records were truncated and how many tokens were dropped. On this dataset, 263 of 382 postings exceeded 256 tokens (62,484 tokens dropped in total) — this was silently discarding real content on every run.

2. **Python/JS embedding-space parity.** `verify_embedding_parity.py` + `js_encode_samples.mjs` encode a fixed sample set with both `sentence-transformers` (Python) and `@xenova/transformers` (JS), compare pooling/normalization/max-length config, and assert cosine similarity ≥ 0.999 per sample. Run this after any dependency bump on either side. The biggest real-world risk: `@xenova/transformers` defaults to an int8-**quantized** ONNX model, which isn't numerically identical to sentence-transformers' full-precision weights — `js_encode_samples.mjs` pins `quantized: false`, and `lib/embedCV.ts` needs to use the same setting or this check passes while production silently drifts.

3. **Pinned dependencies.** `requirements.txt` pins every direct and load-bearing transitive dependency (`sentence-transformers`, `transformers`, `tokenizers`, `huggingface-hub`, `torch`, `numpy`). CPU-only torch is pinned deliberately: this pipeline encodes ~382 short postings once, offline — GPU throughput doesn't matter at that scale, and an unpinned install here was confirmed to pull the full CUDA build (`torch` + ~15 `nvidia-*` packages, multiple GB). Switch to a CUDA wheel from pytorch.org only if the dataset grows large enough that re-embedding time becomes an actual bottleneck.

4. **Output validation before save.** Every embedding is checked for exact 384 dimensionality, no NaN/Inf, unit L2 norm, and no duplicate/all-zero vectors before anything is written; failure exits non-zero with the offending record IDs listed. **This caught a real, previously-undetected bug**: `generate_embeddings_sandbox_demo.py` was silently producing 382-dimensional embeddings instead of 384 — `TruncatedSVD` can't produce more components than the number of documents (382), and scikit-learn doesn't error when you ask for more, it just quietly returns fewer. Fixed by capping the SVD request and zero-padding back to 384-dim (safe: padding with zeros before L2-normalizing doesn't change the vector's direction or norm), with the same validation now run inside that script too.

5. **Model version metadata.** Both scripts write `jobs_with_embeddings.metadata.json` (model name, revision if available, embedding dimension, pooling, normalization, max tokens, library versions, generation timestamp, and `is_sandbox_demo`) so stale or mismatched embeddings are detectable downstream instead of silent.

6. **Encoding cleanup.** `full_text` sometimes contains mojibake — literal `????` runs from lossy replacement, or UTF-8 bytes mis-decoded as Latin-1 — left over from scraping (4 of the 382 records were affected, e.g. `"Location New Cairo, Egypt ???? Work Structure Hybrid"`). `detect_mojibake()` flags these; `clean_text()` does a conservative repair (strips known-garbage runs and unassigned/control characters) without guessing the original bytes, since that guess is wrong as often as it's right. All 4 flagged records were auto-cleaned on the last confirmed run. Records still flagged after cleaning are logged so you can decide whether to exclude them rather than embedding garbage as signal.

7. **Sandbox vs. production.** `generate_embeddings_sandbox_demo.py` prints a loud console banner on every run and writes `is_sandbox_demo: true` to its metadata sidecar. It validates plumbing — shapes, JSON structure, UI wiring — **not match quality**; TF-IDF+SVD and MiniLM rank jobs differently, so a ranking that looks good or bad in sandbox mode says nothing about production quality. `lib/jobs.ts` (or wherever the webapp loads `jobs_with_embeddings.json`) should read the metadata sidecar and show a persistent banner like:

   > ⚠️ DEMO DATA: embeddings generated by the TF-IDF+SVD sandbox fallback, NOT the production all-MiniLM-L6-v2 model. Match rankings are not representative of production quality.

   whenever `is_sandbox_demo` is `true`, so "the matches look bad" reports don't get filed against sandbox data.

### Running the checks

```bash
pip install -r requirements.txt
python generate_embeddings.py     # writes jobs_with_embeddings.json + .metadata.json

# in the Next.js project, wherever @xenova/transformers is installed:
cd webapp && npm install @xenova/transformers && cd ..
python verify_embedding_parity.py --node-cwd ./webapp
```

## Running locally

```bash
cd webapp
npm install
cp .env.example .env.local   # add your GEMINI_API_KEY
npm run dev
```

Open <http://localhost:3000>, paste a CV — or upload a **.pdf**, **.docx**, or **.txt** file directly (drag-and-drop or the upload button) — and submit. PDF/DOCX text extraction happens entirely in the browser (`pdfjs-dist` for PDF, `mammoth` for DOCX) before the CV text is sent to the API; old binary `.doc` files aren't supported — save as `.docx` or `.pdf` instead. The first request also downloads the CV-embedding model (transformers.js) — needs normal internet access, cached after that.

## Deploying

1. Push the repo to GitHub, with the real `webapp/data/jobs_with_embeddings.json` and `.metadata.json` committed (not gitignored).
2. In Vercel, import the repo and set **Root Directory** to `webapp` — Vercel needs to find `package.json` there, not at the repo root.
3. Set the `GEMINI_API_KEY` environment variable in Vercel's project settings.
4. Deploy. Free tier is sufficient on both Vercel and Gemini — no paid infrastructure needed.

## Production considerations

Beyond a working deploy, a few things are worth checking before sharing the link publicly:

- **API key placement.** `GEMINI_API_KEY` is read server-side only, inside `app/api/analyze/route.ts` (`runtime = "nodejs"`) — it never reaches the browser bundle. Keep any future Gemini calls behind an API route the same way.
- **Rate limiting.** `/api/analyze` is a public, unauthenticated endpoint hitting a metered API. A simple in-memory per-IP limiter (e.g. 10 requests/minute) is enough for a portfolio project and prevents accidental quota exhaustion.
- **`npm audit`.** Run `npm audit` in `webapp/` and address high/critical findings before sharing the link.
- **Function timeout.** `route.ts` sets `maxDuration = 60`, but Vercel's Hobby (free) plan defaults to a shorter serverless function timeout. Test with a long CV after deploying and watch for `504` responses.
- **`.env` hygiene.** Confirm `.env` (not `.env.example`) is in `.gitignore` before the first commit.

## What was verified in the original build sandbox

- **Similarity ranking logic**: tested directly against the real 382 job embeddings — querying with an "iOS Mobile Developer" job's own vector correctly surfaced other mobile/full-stack roles at the top and completely unrelated fields (accounting, teaching) at the bottom, confirming the cosine-similarity ranking works correctly.
- **Next.js build**: `npm run build` compiles cleanly with no TypeScript or webpack errors, including the `onnxruntime-node` native-binary externalization needed for `@xenova/transformers` to work on Vercel.
- **Not verified in that sandbox** (needed normal internet): actually downloading the MiniLM weights at runtime, and a live call to the Gemini API. Both are standard, well-documented flows and have since been confirmed working on a local machine and in the browser.
