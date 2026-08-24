"use client";

import { useState } from "react";
import CVInput from "@/components/CVInput";
import JobResultCard from "@/components/JobResultCard";
import type { AnalyzeResponse } from "@/lib/types";

export default function Home() {
  const [cvText, setCvText] = useState("");
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
        body: JSON.stringify({ cvText, topN: 6 }),
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
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "56px 20px 100px" }}>
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
          FITMATCH
        </p>
        <h1 style={{ fontSize: 34, lineHeight: 1.2, marginBottom: 14, color: "var(--white)" }}>
          Find the roles that actually fit
        </h1>
        <p style={{ fontSize: 15.5, color: "var(--warm-gray-light)", lineHeight: 1.6, maxWidth: 520, margin: "0 auto" }}>
          Paste your CV and we&apos;ll match it against real open roles, then break down exactly
          where you&apos;re strong and where you&apos;ll need to grow — no guesswork.
        </p>
      </header>

      <CVInput value={cvText} onChange={setCvText} onSubmit={handleSubmit} loading={loading} />

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
              marginBottom: 28,
            }}
          >
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--mint)", letterSpacing: 0.5, marginBottom: 8 }}>
              OVERALL RECOMMENDATION
            </p>
            <p style={{ fontSize: 15, lineHeight: 1.65 }}>{result.overallRecommendation}</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {result.results.map((r, i) => (
              <JobResultCard
                key={r.job.id}
                job={r.job}
                matchPercent={r.matchPercent}
                analysis={r.analysis}
                index={i}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
