"use client";

import { useEffect, useState } from "react";

export default function MatchRing({
  percent,
  delayMs = 0,
  size = 76,
}: {
  percent: number;
  delayMs?: number;
  size?: number;
}) {
  const [animated, setAnimated] = useState(0);
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const t = setTimeout(() => setAnimated(percent), 80 + delayMs);
    return () => clearTimeout(t);
  }, [percent, delayMs]);

  const offset = circumference - (animated / 100) * circumference;
  const color = percent >= 70 ? "var(--mint)" : percent >= 45 ? "#c9a227" : "var(--warm-gray)";

  return (
    <div
      style={{ width: size, height: size, position: "relative", flexShrink: 0 }}
      role="img"
      aria-label={`Match score: ${percent} percent`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--warm-gray-light)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.16, 1, 0.3, 1)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
        }}
      >
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: size * 0.26 }}>
          {animated}
        </span>
        <span style={{ fontSize: size * 0.12, color: "var(--warm-gray)", marginTop: -2 }}>
          % match
        </span>
      </div>
    </div>
  );
}
