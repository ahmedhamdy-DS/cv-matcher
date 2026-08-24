import type { Pipeline } from "@xenova/transformers";


const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

let pipelinePromise: Promise<Pipeline> | null = null;

async function getPipeline(): Promise<Pipeline> {
  if (!pipelinePromise) {
    const { pipeline } = await import("@xenova/transformers");
    pipelinePromise = pipeline("feature-extraction", MODEL_ID) as Promise<Pipeline>;
  }
  return pipelinePromise;
}


export async function embedText(text: string): Promise<number[]> {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}
