"use client";

import { useState } from "react";
import Link from "next/link";
import CVInput, { CandidateCV } from "@/components/CVInput";
import CandidateAgainstJDCard from "@/components/CandidateAgainstJDCard";
import type { CompareJDResponse } from "@/lib/types";

export default function CompareJD() {
  const [jobDescription, setJobDescription] = useState("");
  const [cvs, setCvs] = useState<CandidateCV[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareJDResponse | null>(null);

  async function handleSubmit() {
    if (!jobDescription.trim()) {
      setError("Paste the job description first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/compare-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription, candidates: cvs }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as CompareJDResponse;
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
          Compare candidates against a job description
        </h1>
        <p style={{ fontSize: 15.5, color: "var(--warm-gray-light)", lineHeight: 1.6, maxWidth: 560, margin: "0 auto" }}>
          Paste the exact role you&apos;re hiring for, upload up to 3 CVs, and see how each candidate
          stacks up against that specific job — not our job database.
        </p>
        <Link
          href="/"
          style={{ display: "inline-block", marginTop: 18, fontSize: 13.5, color: "var(--mint)", textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          Match against our job database instead →
        </Link>
      </header>

      <div
        style={{
          background: "var(--white)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-card)",
          padding: 28,
          marginBottom: 24,
        }}
      >
        <label
          htmlFor="jd"
          style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, display: "block", marginBottom: 12 }}
        >
          Job Description
        </label>
        <textarea
          id="jd"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the full job description here — title, responsibilities, requirements…"
          rows={10}
          style={{
            width: "100%",
            resize: "vertical",
            border: "1.5px solid var(--warm-gray-light)",
            borderRadius: "var(--radius-md)",
            padding: 16,
            fontSize: 14.5,
            lineHeight: 1.6,
            color: "var(--navy)",
            background: "var(--cream)",
            fontFamily: "inherit",
          }}
        />
        <p style={{ fontSize: 12.5, color: "var(--warm-gray)", marginTop: 8, textAlign: "right" }}>
          {jobDescription.trim().length} characters
        </p>
      </div>

      <CVInput cvs={cvs} onChange={setCvs} onSubmit={handleSubmit} loading={loading} />

      {error && (
        <p style={{ marginTop: 20, color: "var(--danger)", fontSize: 14, textAlign: "center" }}>
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
              OVERALL RECOMMENDATION
            </p>
            <div style={{ fontSize: 15, lineHeight: 1.8, whiteSpace: "pre-wrap", color: "var(--cream)" }}>
              {result.overallRecommendation}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {result.ranking.map((r, i) => (
              <CandidateAgainstJDCard key={r.candidateId} result={r} rank={i} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
