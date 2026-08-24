import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { embedText } from "@/lib/embedCV";
import { scoreEmbeddings } from "@/lib/similarity";
import type {
  CompareJDRequestBody,
  CompareJDResponse,
  JDCandidateResult,
  CandidateCV,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_MODEL = "gemini-2.5-flash";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CompareJDRequestBody;
    const jobDescription = (body.jobDescription ?? "").trim();
    const candidates = body.candidates ?? [];

    if (!jobDescription) {
      return NextResponse.json({ error: "Paste a job description first." }, { status: 400 });
    }
    if (!candidates.length || candidates.length > 3) {
      return NextResponse.json({ error: "Must provide 1 to 3 candidates" }, { status: 400 });
    }
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "Server is missing GEMINI_API_KEY" }, { status: 500 });
    }

    const safeJD = jobDescription.substring(0, 15000);

    // 1. Embed the JD once and every CV, then score with the SAME cosine-similarity
    //    function used for the job-database flow — no similarity number is ever
    //    invented by the LLM, only computed from the embeddings.
    const jdEmbedding = await embedText(safeJD);

    const scored = await Promise.all(
      candidates.map(async (c) => {
        const safeText = c.text.trim().substring(0, 15000);
        const embedding = await embedText(safeText);
        const { matchPercent } = scoreEmbeddings(embedding, jdEmbedding);
        return { candidate: c, matchPercent };
      })
    );

    scored.sort((a, b) => b.matchPercent - a.matchPercent);

    // 2. Gemini only ever explains fit for the exact JD + CV pairs and match
    //    percentages computed above — it never sees or invents other roles.
    const analysis = await analyzeAgainstJD(safeJD, scored);

    const ranking: JDCandidateResult[] = scored.map(({ candidate, matchPercent }) => {
      const a = analysis.candidates.find((x) => x.candidate_id === candidate.id);
      return {
        candidateId: candidate.id,
        candidateName: candidate.name,
        matchPercent,
        verdict: a?.verdict ?? "possible_fit",
        strengths: a?.strengths ?? [],
        gaps: a?.gaps ?? [],
        summary: a?.summary ?? "Analysis unavailable.",
      };
    });

    const response: CompareJDResponse = {
      overallRecommendation: analysis.overall_recommendation,
      ranking,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("compare-jd route error:", err);
    return NextResponse.json(
      { error: "Something went wrong comparing the candidates. Please try again." },
      { status: 500 }
    );
  }
}

async function analyzeAgainstJD(
  jobDescription: string,
  scored: Array<{ candidate: CandidateCV; matchPercent: number }>
) {
  const promptData = {
    job_description: jobDescription,
    candidates: scored.map((s) => ({
      candidate_id: s.candidate.id,
      candidate_name: s.candidate.name,
      cv_text: s.candidate.text.substring(0, 4000),
      semantic_match_percent: s.matchPercent,
    })),
  };

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction:
      "You are an expert HR and recruitment AI assistant. You are given ONE specific job description " +
      "and up to 3 candidate CVs, each already scored with a semantic match percentage against that exact " +
      "job description (computed separately — do not recompute or contradict it). " +
      "For each candidate, evaluate their fit strictly against the requirements stated in THIS job description " +
      "— cite concrete strengths (skills, years of experience, tools) and gaps versus what the job description " +
      "actually asks for. Do not invent requirements the job description doesn't mention. " +
      "Finally, give an overall recommendation ranking the candidates for THIS role specifically and why.",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          overall_recommendation: {
            type: SchemaType.STRING,
            description:
              "A highly scannable HR summary. Format it EXACTLY like this using newline characters:\n" +
              "🏆 Best Fit: [Candidate Name]\n\n" +
              "• [Candidate 1]: [1 sentence on fit for this specific role]\n" +
              "• [Candidate 2]: [1 sentence on fit for this specific role]\n" +
              "• [Candidate 3]: [1 sentence on fit for this specific role]",
          },
          candidates: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                candidate_id: { type: SchemaType.STRING },
                verdict: {
                  type: SchemaType.STRING,
                  enum: ["strong_fit", "possible_fit", "weak_fit"],
                },
                strengths: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                gaps: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                summary: { type: SchemaType.STRING },
              },
              required: ["candidate_id", "verdict", "strengths", "gaps", "summary"],
            },
          },
        },
        required: ["overall_recommendation", "candidates"],
      },
    },
  });

  const result = await model.generateContent(
    `JOB DESCRIPTION AND CANDIDATES DATA:\n${JSON.stringify(promptData, null, 2)}`
  );

  const text = result.response.text();
  return JSON.parse(text) as {
    overall_recommendation: string;
    candidates: Array<{
      candidate_id: string;
      verdict: "strong_fit" | "possible_fit" | "weak_fit";
      strengths: string[];
      gaps: string[];
      summary: string;
    }>;
  };
}
