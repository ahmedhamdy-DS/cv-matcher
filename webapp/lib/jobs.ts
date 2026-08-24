import type { JobRecord } from "./types";
import jobsData from "../data/jobs_with_embeddings.json";


let cached: JobRecord[] | null = null;

export function getAllJobs(): JobRecord[] {
  if (!cached) {
    cached = jobsData as unknown as JobRecord[];
  }
  return cached;
}
