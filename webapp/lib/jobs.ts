import type { JobRecord } from "./types";
import jobsData from "../data/jobs_with_embeddings.json";

// Bundled as static data at build time — no external vector DB, no
// runtime fetch. 382 records with embeddings is small enough to load
// entirely into memory per server instance.
let cached: JobRecord[] | null = null;

export function getAllJobs(): JobRecord[] {
  if (!cached) {
    cached = jobsData as unknown as JobRecord[];
  }
  return cached;
}
