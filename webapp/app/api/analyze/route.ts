import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { embedText } from "@/lib/embedCV";
import { getAllJobs } from "@/lib/jobs";
import { rankJobsBySimilarity } from "@/lib/similarity";
import type { AnalyzeRequestBody, AnalyzeResponse, JobAnalysis, RankedJob } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;


const GEMINI_MODEL = "gemini-2.5-flash";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalyzeRequestBody;
    const cvText = (body.cvText ?? "").trim();
    const topN = Math.min(Math.max(body.topN ?? 6, 1), 12);

    if (!cvText) {
      return NextResponse.json({ error: "cvText is required" }, { status: 400 });
    }
    if (cvText.length > 20000) {
      return NextResponse.json({ error: "CV text is too long" }, { status: 400 });
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Server is missing GEMINI_API_KEY" },
        { status: 500 }
      );
    }


    const cvEmbedding = await embedText(cvText);


    const jobs = getAllJobs();
    const ranked = rankJobsBySimilarity(cvEmbedding, jobs, topN);

    // 3. Ask Gemini to analyze fit for the shortlisted matches.
    const analyses = await analyzeMatches(cvText, ranked);

    const response: AnalyzeResponse = {
      overallRecommendation: analyses.overallRecommendation,
      results: ranked.map((r) => ({
        job: r.job,
        matchPercent: r.matchPercent,
        analysis:
          analyses.perJob.find((a) => a.jobId === r.job.id) ??
          fallbackAnalysis(r.job.id),
      })),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("analyze route error:", err);
    return NextResponse.json(
      { error: "Something went wrong analyzing your CV. Please try again." },
      { status: 500 }
    );
  }
}

function fallbackAnalysis(jobId: string): JobAnalysis {
  return {
    jobId,
    verdict: "possible_fit",
    strengths: [],
    gaps: [],
    summary: "Analysis unavailable for this role.",
  };
}

async function analyzeMatches(
  cvText: string,
  ranked: RankedJob[]
): Promise<{ overallRecommendation: string; perJob: JobAnalysis[] }> {
  const jobsForPrompt = ranked.map((r) => ({
    id: r.job.id,
    title: r.job.title,
    company: r.job.company_name,
    career_level: r.job.career_level,
    location: [r.job.area, r.job.city, r.job.country].filter(Boolean).join(", "),
    workplace_arrangement: r.job.workplace_arrangement,
    experience_years_min: r.job.experience_years_min,
    experience_years_max: r.job.experience_years_max,
    keywords: r.job.keywords,
    requirements: r.job.requirements_clean,
    match_percent: r.matchPercent,
  }));

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction:
      "You are a career-matching assistant. You are given a candidate's CV text and a shortlist of job postings " +
      "that were already selected by semantic similarity search. For each job, assess fit honestly: call out real " +
      "strengths and real gaps relative to the stated requirements and experience level. Be specific and concrete, " +
      "grounded only in the CV text and job data provided — do not invent experience the candidate didn't mention.",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          overall_recommendation: {
            type: SchemaType.STRING,
            description:
              "2-4 sentences summarizing the candidate's profile and which of the shortlisted roles fit best overall, and why.",
          },
          per_job: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                job_id: { type: SchemaType.STRING },
                verdict: {
                  type: SchemaType.STRING,
                  enum: ["strong_fit", "possible_fit", "weak_fit"],
                },
                strengths: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                  description: "2-4 short bullet points on why the candidate fits this role.",
                },
                gaps: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                  description: "1-3 short bullet points on gaps or missing requirements.",
                },
                summary: {
                  type: SchemaType.STRING,
                  description: "One or two sentence summary of the fit for this specific role.",
                },
              },
              required: ["job_id", "verdict", "strengths", "gaps", "summary"],
            },
          },
        },
        required: ["overall_recommendation", "per_job"],
      },
    },
  });

  const result = await model.generateContent(
    `CANDIDATE CV:\n${cvText}\n\n` +
      `SHORTLISTED JOBS (already ranked by embedding similarity):\n${JSON.stringify(
        jobsForPrompt,
        null,
        2
      )}`
  );

  const text = result.response.text();
  const parsed = JSON.parse(text) as {
    overall_recommendation: string;
    per_job: Array<{
      job_id: string;
      verdict: JobAnalysis["verdict"];
      strengths: string[];
      gaps: string[];
      summary: string;
    }>;
  };

  return {
    overallRecommendation: parsed.overall_recommendation,
    perJob: parsed.per_job.map((p) => ({
      jobId: p.job_id,
      verdict: p.verdict,
      strengths: p.strengths ?? [],
      gaps: p.gaps ?? [],
      summary: p.summary ?? "",
    })),
  };
}
