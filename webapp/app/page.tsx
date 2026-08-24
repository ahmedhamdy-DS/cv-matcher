"use client";

import { useState } from "react";
import CVInput, { CandidateCV } from "@/components/CVInput";
import JobResultCard from "@/components/JobResultCard";
import type { AnalyzeResponse } from "@/lib/types";

export default function Home() {
  const [cvs, setCvs] = useState<CandidateCV[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: cvs, topN: 3 }), 
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as AnalyzeResponse;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px 100px" }}>
      <header
        style={{
          background: "var(--navy)",
          borderRadius: "var(--radius-lg)",
          padding: "48px 32px",
          marginBottom: 40,
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--mint)",
            letterSpacing: 1,
            marginBottom: 10,
          }}
        >
          FITMATCH FOR HR
        </p>
        <h1 style={{ fontSize: 34, lineHeight: 1.2, marginBottom: 14, color: "var(--white)" }}>
          Compare candidates against real roles
        </h1>
        <p style={{ fontSize: 15.5, color: "var(--warm-gray-light)", lineHeight: 1.6, maxWidth: 520, margin: "0 auto" }}>
          Upload up to 3 CVs. We&apos;ll match each candidate against market open roles and help you 
          find the best fit instantly.
        </p>
      </header>

      <CVInput cvs={cvs} onChange={setCvs} onSubmit={handleSubmit} loading={loading} />

      {error && (
        <p
          style={{
            marginTop: 20,
            color: "var(--danger)",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          {error}
        </p>
      )}

      {result && (
        <section style={{ marginTop: 44 }}>
          <div
            style={{
              background: "var(--navy)",
              color: "var(--white)",
              borderRadius: "var(--radius-lg)",
              padding: 24,
              marginBottom: 40,
            }}
          >
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--mint)", letterSpacing: 0.5, marginBottom: 8 }}>
              OVERALL HR RECOMMENDATION
            </p>
           
            <div style={{ fontSize: 15, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "var(--cream)" }}>
              {result.overallRecommendation}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
            {result.candidates.map((candidate) => (
              <div key={candidate.candidateId} style={{ border: "1px solid var(--warm-gray-light)", padding: 24, borderRadius: "var(--radius-lg)", background: "var(--cream)" }}>
                <h2 style={{ fontSize: 22, color: "var(--navy)", marginBottom: 8 }}>👤 {candidate.candidateName}</h2>
                <p style={{ fontSize: 14.5, color: "var(--warm-gray)", marginBottom: 24, lineHeight: 1.6 }}>{candidate.candidateSummary}</p>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {candidate.topJobs.map((r, i) => (
                    <JobResultCard
                      key={r.job.id}
                      job={r.job}
                      matchPercent={r.matchPercent}
                      analysis={r.analysis}
                      index={i}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}