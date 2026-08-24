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

export type JobPublic = Omit<JobRecord, "embedding">;

export interface RankedJob {
  job: JobPublic;
  similarity: number;
  matchPercent: number;
}

export interface JobAnalysis {
  jobId: string;
  verdict: "strong_fit" | "possible_fit" | "weak_fit";
  strengths: string[];
  gaps: string[];
  summary: string;
}



export interface CandidateCV {
  id: string;
  name: string;
  text: string;
}

export interface AnalyzeRequestBody {
  candidates: CandidateCV[]; 
  topN?: number;
}

export interface CandidateResult {
  candidateId: string;
  candidateName: string;
  candidateSummary: string;
  topJobs: Array<{
    job: JobPublic;
    matchPercent: number;
    analysis: JobAnalysis;
  }>;
}

export interface AnalyzeResponse {
  overallRecommendation: string; 
  candidates: CandidateResult[]; 
}
