"use client";

import MatchRing from "./MatchRing";
import type { JDCandidateResult } from "@/lib/types";

const VERDICT_LABEL: Record<JDCandidateResult["verdict"], string> = {
  strong_fit: "Strong fit",
  possible_fit: "Worth a look",
  weak_fit: "Stretch role",
};

const VERDICT_COLOR: Record<JDCandidateResult["verdict"], string> = {
  strong_fit: "var(--mint)",
  possible_fit: "#c9a227",
  weak_fit: "var(--warm-gray)",
};

export default function CandidateAgainstJDCard({
  result,
  rank,
}: {
  result: JDCandidateResult;
  rank: number;
}) {
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
      <MatchRing percent={result.matchPercent} delayMs={rank * 120} />

      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ fontSize: 18 }}>
            #{rank + 1} · {result.candidateName}
          </h3>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: VERDICT_COLOR[result.verdict],
              background: "var(--cream)",
              border: `1px solid ${VERDICT_COLOR[result.verdict]}33`,
              borderRadius: 999,
              padding: "4px 12px",
              whiteSpace: "nowrap",
            }}
          >
            {VERDICT_LABEL[result.verdict]}
          </span>
        </div>

        <p style={{ fontSize: 14.5, lineHeight: 1.6, marginTop: 12, color: "var(--navy)" }}>
          {result.summary}
        </p>

        <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap" }}>
          {result.strengths.length > 0 && (
            <div style={{ flex: "1 1 200px" }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--mint)", marginBottom: 6, letterSpacing: 0.3 }}>
                STRENGTHS
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: "var(--navy)" }}>
                {result.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {result.gaps.length > 0 && (
            <div style={{ flex: "1 1 200px" }}>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--danger)", marginBottom: 6, letterSpacing: 0.3 }}>
                GAPS
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7, color: "var(--navy)" }}>
                {result.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
