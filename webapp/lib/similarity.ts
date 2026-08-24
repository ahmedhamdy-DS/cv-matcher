import type { JobRecord, RankedJob } from "./types";


function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}


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
    
      matchPercent: similarityToDisplayPercent(similarity),
    };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topN);
}

function similarityToDisplayPercent(similarity: number): number {

  const low = 0.2;
  const high = 0.75;
  const clamped = Math.min(Math.max(similarity, low), high);
  const pct = ((clamped - low) / (high - low)) * 93 + 5;
  return Math.round(pct);
}

// Same scoring used for job-vs-CV, exposed for the single-JD compare flow
// (compare-jd route): score one CV embedding against one JD embedding.
export function scoreEmbeddings(a: number[], b: number[]): { similarity: number; matchPercent: number } {
  const similarity = dot(a, b);
  return { similarity, matchPercent: similarityToDisplayPercent(similarity) };
}
