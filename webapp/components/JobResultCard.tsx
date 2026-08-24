"use client";

import MatchRing from "./MatchRing";
import type { JobPublic, JobAnalysis } from "@/lib/types";

const VERDICT_LABEL: Record<JobAnalysis["verdict"], string> = {
  strong_fit: "Strong fit",
  possible_fit: "Worth a look",
  weak_fit: "Stretch role",
};

const VERDICT_COLOR: Record<JobAnalysis["verdict"], string> = {
  strong_fit: "var(--mint)",
  possible_fit: "#c9a227",
  weak_fit: "var(--warm-gray)",
};

export default function JobResultCard({
  job,
  matchPercent,
  analysis,
  index,
}: {
  job: JobPublic;
  matchPercent: number;
  analysis: JobAnalysis;
  index: number;
}) {
  const location = [job.area, job.city].filter(Boolean).join(", ");

  return (
    <div
      style={{
        background: "var(--white)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        padding: 24,
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
      }}
    >
      <MatchRing percent={matchPercent} delayMs={index * 120} />

      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: 18 }}>{job.title}</h3>
            <p style={{ color: "var(--warm-gray)", fontSize: 14, marginTop: 3 }}>
              {job.company_name}
              {location ? ` · ${location}` : ""}
              {job.workplace_arrangement ? ` · ${job.workplace_arrangement}` : ""}
            </p>
          </div>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: VERDICT_COLOR[analysis.verdict],
              background: "var(--cream)",
              border: `1px solid ${VERDICT_COLOR[analysis.verdict]}33`,
              borderRadius: 999,
              padding: "4px 12px",
              whiteSpace: "nowrap",
            }}
          >
            {VERDICT_LABEL[analysis.verdict]}
          </span>
        </div>

        <p style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 12, color: "var(--navy)" }}>
          {analysis.summary}
        </p>

        <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
          {analysis.strengths.length > 0 && (
            <div style={{ flex: "1 1 200px" }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--mint)", marginBottom: 6, letterSpacing: 0.3 }}>
                STRENGTHS
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: "var(--navy)" }}>
                {analysis.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {analysis.gaps.length > 0 && (
            <div style={{ flex: "1 1 200px" }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--danger)", marginBottom: 6, letterSpacing: 0.3 }}>
                GAPS
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: "var(--navy)" }}>
                {analysis.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginTop: 16,
            fontSize: 13.5,
            fontWeight: 600,
            color: "var(--navy)",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          View posting →
        </a>
      </div>
    </div>
  );
}
