import type { JobRecord, RankedJob } from "./types";

/**
 * Dot product of two equal-length vectors. Since both the job
 * embeddings (from generate_embeddings.py) and the CV embedding
 * (from embedCV.ts) are L2-normalized, dot product == cosine
 * similarity — cheaper to compute and just as correct.
 */
function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Rank all jobs by cosine similarity to the CV vector and return the
 * top N. Plain JS loop over ~382 records — negligible cost, no
 * external vector database required.
 */
export function rankJobsBySimilarity(
  cvEmbedding: number[],
  jobs: JobRecord[],
  topN: number = 6
): RankedJob[] {
  const scored = jobs.map((job) => {
    const similarity = dot(cvEmbedding, job.embedding);
    const { embedding, ...jobPublic } = job;
    return {
      job: jobPublic,
      similarity,
      // Cosine similarity for real-world short-text embeddings tends
      // to cluster in a narrow band (rarely near 0 or 1). Rescale to
      // a friendlier display range so "good matches" don't all look
      // like 40-something percent.
      matchPercent: similarityToDisplayPercent(similarity),
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topN);
}

function similarityToDisplayPercent(similarity: number): number {
  // Empirically, MiniLM cosine similarity for related-but-imperfect
  // text pairs sits roughly in [0.2, 0.75]. Clamp + rescale that band
  // to [5, 98] for display, rather than showing raw cosine values
  // that would make even strong matches look low.
  const low = 0.2;
  const high = 0.75;
  const clamped = Math.min(Math.max(similarity, low), high);
  const pct = ((clamped - low) / (high - low)) * 93 + 5;
  return Math.round(pct);
}
