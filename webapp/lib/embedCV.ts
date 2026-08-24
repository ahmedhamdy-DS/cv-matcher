import type { Pipeline } from "@xenova/transformers";

// Server-side singleton: load the feature-extraction pipeline once
// per server instance and reuse it across requests. This runs the
// exact same model (all-MiniLM-L6-v2) as the offline Python step, so
// the CV vector lands in the same embedding space as the precomputed
// job vectors — no separate Python service needed at runtime.
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let pipelinePromise: Promise<Pipeline> | null = null;

async function getPipeline(): Promise<Pipeline> {
  if (!pipelinePromise) {
    const { pipeline } = await import("@xenova/transformers");
    pipelinePromise = pipeline("feature-extraction", MODEL_ID) as Promise<Pipeline>;
  }
  return pipelinePromise;
}

/**
 * Embed arbitrary text (the CV) into a 384-dim, L2-normalized vector,
 * matching how generate_embeddings.py encoded each job's full_text
 * (mean pooling + normalization).
 */
export async function embedText(text: string): Promise<number[]> {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}
