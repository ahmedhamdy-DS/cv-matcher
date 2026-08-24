export interface JobRecord {
  id: string;
  title: string;
  company_name: string;
  career_level: string | null;
  workplace_arrangement: string | null;
  experience_years_min: number | null;
  experience_years_max: number | null;
  city: string | null;
  area: string | null;
  country: string | null;
  keywords: string[];
  url: string;
  description_clean: string | null;
  requirements_clean: string | null;
  full_text: string;
  posted_at?: string | null;
  embedding: number[];
}

// Job record as sent to the client / LLM — never includes the raw
// embedding vector (no reason to ship 384 floats to the browser).
export type JobPublic = Omit<JobRecord, "embedding">;

export interface RankedJob {
  job: JobPublic;
  similarity: number; // cosine similarity, 0..1
  matchPercent: number; // similarity rescaled to a friendlier 0..100 display range
}

export interface JobAnalysis {
  jobId: string;
  verdict: "strong_fit" | "possible_fit" | "weak_fit";
  strengths: string[];
  gaps: string[];
  summary: string;
}

export interface AnalyzeResponse {
  overallRecommendation: string;
  results: Array<{
    job: JobPublic;
    matchPercent: number;
    analysis: JobAnalysis;
  }>;
}

export interface AnalyzeRequestBody {
  cvText: string;
  topN?: number;
}
