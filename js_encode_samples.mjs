// js_encode_samples.mjs
//
// Encodes a fixed set of sample texts with @xenova/transformers, using the
// exact same call shape the Next.js app uses in-browser to embed the user's
// CV. This is invoked by verify_embedding_parity.py as the "JS side" of the
// cross-runtime parity check — do not run it standalone as part of the
// production pipeline.
//
// IMPORTANT: `quantized: false` is set deliberately. @xenova/transformers
// defaults to an int8-quantized ONNX model for speed/size, which is NOT the
// same weights as the full-precision PyTorch model sentence-transformers
// loads in Python. If your actual frontend code omits `quantized: false`,
// the two pipelines are silently comparing different models — that's the
// single most common cause of Python/JS embedding drift for this model.
// Whatever value you choose here must match what the frontend really ships.
//
// Usage: node js_encode_samples.mjs <samples.json>
// Prints a single JSON object to stdout: { model_id, pooling, normalize,
// quantized, max_tokens_configured, embeddings: number[][] }

import { pipeline, env } from '@xenova/transformers';
import { readFileSync } from 'fs';

env.allowLocalModels = false;

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'; // ONNX port of sentence-transformers/all-MiniLM-L6-v2
const MAX_TOKENS = 256;
const QUANTIZED = false; // must match frontend config — see note above

async function main() {
  const samplesPath = process.argv[2];
  if (!samplesPath) {
    console.error('Usage: node js_encode_samples.mjs <samples.json>');
    process.exit(1);
  }
  const texts = JSON.parse(readFileSync(samplesPath, 'utf-8'));

  const extractor = await pipeline('feature-extraction', MODEL_ID, {
    quantized: QUANTIZED,
  });

  const embeddings = [];
  for (const text of texts) {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data));
  }

  const result = {
    model_id: MODEL_ID,
    pooling: 'mean',
    normalize: true,
    quantized: QUANTIZED,
    max_tokens_configured: MAX_TOKENS,
    embeddings,
  };

  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  console.error('JS encoding failed:', err);
  process.exit(1);
});
