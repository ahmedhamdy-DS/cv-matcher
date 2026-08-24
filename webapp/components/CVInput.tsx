"use client";

import { useRef, useState } from "react";
import { extractTextFromFile } from "@/lib/extractText";

export default function CVInput({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setFileError(null);
    setExtracting(true);
    try {
      const text = await extractTextFromFile(file);
      setFileName(file.name);
      onChange(text);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--white)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-card)",
        padding: 28,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <label htmlFor="cv-text" style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>
          Paste your CV
        </label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={extracting}
          style={{
            background: "none",
            border: "1px solid var(--warm-gray-light)",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 13,
            color: "var(--navy)",
            whiteSpace: "nowrap",
          }}
        >
          {extracting ? "Reading file…" : fileName ? `Loaded: ${fileName}` : "Upload PDF, Word, or .txt"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
      </div>

      <textarea
        id="cv-text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste the full text of your CV here — experience, skills, education..."
        rows={12}
        style={{
          width: "100%",
          resize: "vertical",
          border: `1.5px solid ${dragOver ? "var(--mint)" : "var(--warm-gray-light)"}`,
          borderRadius: "var(--radius-md)",
          padding: 16,
          fontFamily: "var(--font-body)",
          fontSize: 14.5,
          lineHeight: 1.6,
          color: "var(--navy)",
          background: dragOver ? "var(--mint-soft)" : "var(--cream)",
          transition: "border-color 0.15s, background 0.15s",
        }}
      />

      {fileError && (
        <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{fileError}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <span style={{ fontSize: 13, color: "var(--warm-gray)" }}>
          {value.trim().length > 0
            ? `${value.trim().split(/\s+/).length} words`
            : "Or drag a PDF, Word, or .txt file in"}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || extracting || value.trim().length < 40}
          style={{
            background: loading || extracting || value.trim().length < 40 ? "var(--warm-gray-light)" : "var(--navy)",
            color: loading || extracting || value.trim().length < 40 ? "var(--warm-gray)" : "var(--white)",
            border: "none",
            borderRadius: 999,
            padding: "12px 26px",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 14.5,
            transition: "background 0.15s",
          }}
        >
          {loading ? "Finding your matches…" : "Find my matches"}
        </button>
      </div>
    </div>
  );
}
