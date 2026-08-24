import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { embedText } from "@/lib/embedCV";
import { getAllJobs } from "@/lib/jobs";
import { rankJobsBySimilarity } from "@/lib/similarity";
import type { 
  AnalyzeRequestBody, 
  AnalyzeResponse, 
  JobAnalysis, 
  RankedJob,
  CandidateCV 
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-2.5-flash";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalyzeRequestBody;
    const candidates = body.candidates ?? [];
    const topN = Math.min(Math.max(body.topN ?? 3, 1), 6); // قللنا الـ default لـ 3 عشان نوفر Tokens

    if (!candidates.length || candidates.length > 3) {
      return NextResponse.json({ error: "Must provide 1 to 3 candidates" }, { status: 400 });
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Server is missing GEMINI_API_KEY" }, { status: 500 });
    }

    const jobs = getAllJobs();

    // 1 & 2. حساب الـ Embeddings والبحث عن أفضل الوظائف لكل مرشح بالتوازي
    const candidateRankings = await Promise.all(
      candidates.map(async (c) => {
        // حماية من السير الذاتية الطويلة جداً
        const safeText = c.text.trim().substring(0, 15000); 
        const embedding = await embedText(safeText);
        const ranked = rankJobsBySimilarity(embedding, jobs, topN);
        return { candidate: c, ranked };
      })
    );

    // 3. إرسال جميع المرشحين ووظائفهم لـ Gemini في طلب واحد (Batching)
    const analyses = await analyzeMultipleMatches(candidateRankings);

    // 4. تجميع الرد النهائي
    const response: AnalyzeResponse = {
      overallRecommendation: analyses.overall_hr_recommendation,
      candidates: candidateRankings.map(({ candidate, ranked }) => {
        const aiAnalysis = analyses.candidates.find((a) => a.candidate_id === candidate.id);

        return {
          candidateId: candidate.id,
          candidateName: candidate.name,
          candidateSummary: aiAnalysis?.summary ?? "Analysis unavailable.",
          topJobs: ranked.map((r) => ({
            job: r.job,
            matchPercent: r.matchPercent,
            analysis: aiAnalysis?.per_job.find((a) => a.jobId === r.job.id) ?? fallbackAnalysis(r.job.id),
          })),
        };
      }),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("analyze route error:", err);
    return NextResponse.json(
      { error: "Something went wrong analyzing the candidates. Please try again." },
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

async function analyzeMultipleMatches(
  rankings: Array<{ candidate: CandidateCV; ranked: RankedJob[] }>
) {
  // تجهيز البيانات اللي هتتبعت للـ Prompt
  const promptData = rankings.map((r) => ({
    candidate_id: r.candidate.id,
    candidate_name: r.candidate.name,
    cv_text: r.candidate.text.substring(0, 4000), // تقليل حجم النص عشان مانعديش الـ limit
    shortlisted_jobs: r.ranked.map((j) => ({
      id: j.job.id,
      title: j.job.title,
      company: j.job.company_name,
      requirements: j.job.requirements_clean,
      match_percent: j.matchPercent,
    })),
  }));

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction:
      "You are an expert HR and recruitment AI assistant. You are given data for up to 3 candidates. " +
      "For each candidate, you will receive their CV text and a shortlist of open roles (already filtered by semantic similarity). " +
      "Your task is to evaluate each candidate's fit for their respective top roles based strictly on facts, noting specific strengths (technologies, years of experience, stability) and gaps. " +
      "Finally, provide an overall comparative HR recommendation stating which candidate is the strongest overall hire and why.",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          overall_hr_recommendation: {
            type: SchemaType.STRING,
            description: "A strong paragraph comparing the candidates and recommending the best overall hire.",
          },
          candidates: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                candidate_id: { type: SchemaType.STRING },
                summary: { type: SchemaType.STRING, description: "A brief professional summary of this specific candidate." },
                per_job: {
                  type: SchemaType.ARRAY,
                  items: {
                    type: SchemaType.OBJECT,
                    properties: {
                      jobId: { type: SchemaType.STRING },
                      verdict: {
                        type: SchemaType.STRING,
                        enum: ["strong_fit", "possible_fit", "weak_fit"],
                      },
                      strengths: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                      gaps: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                      summary: { type: SchemaType.STRING },
                    },
                    required: ["jobId", "verdict", "strengths", "gaps", "summary"],
                  },
                },
              },
              required: ["candidate_id", "summary", "per_job"],
            },
          },
        },
        required: ["overall_hr_recommendation", "candidates"],
      },
    },
  });

  const result = await model.generateContent(
    `CANDIDATES AND JOBS DATA:\n${JSON.stringify(promptData, null, 2)}`
  );

  const text = result.response.text();
  return JSON.parse(text) as {
    overall_hr_recommendation: string;
    candidates: Array<{
      candidate_id: string;
      summary: string;
      per_job: JobAnalysis[];
    }>;
  };
}
