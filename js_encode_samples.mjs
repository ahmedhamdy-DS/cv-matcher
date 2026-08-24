

import { pipeline, env } from '@xenova/transformers';
import { readFileSync } from 'fs';

env.allowLocalModels = false;

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'; 
const QUANTIZED = false;

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
