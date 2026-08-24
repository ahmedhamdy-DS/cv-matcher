"use client";

import { useRef, useState } from "react";
import { extractTextFromFile } from "@/lib/extractText";

export type CandidateCV = {
  id: string;
  name: string;
  text: string;
};

export default function CVInput({
  cvs,
  onChange,
  onSubmit,
  loading,
}: {
  cvs: CandidateCV[];
  onChange: (cvs: CandidateCV[]) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  async function handleFiles(files: FileList | File[]) {
    setFileError(null);
    setExtracting(true);
    
    const newCvs: CandidateCV[] = [];
    const filesArray = Array.from(files).slice(0, 3 - cvs.length);

    if (cvs.length + Array.from(files).length > 3) {
      setFileError("You can only compare up to 3 candidates at a time.");
    }

    try {
      for (const file of filesArray) {
        const text = await extractTextFromFile(file);
        newCvs.push({
          id: Math.random().toString(36).substring(7),
          name: file.name,
          text: text,
        });
      }
      onChange([...cvs, ...newCvs]);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Couldn't read one or more files.");
    } finally {
      setExtracting(false);
    }
  }

  const removeCv = (id: string) => {
    onChange(cvs.filter((cv) => cv.id !== id));
  };

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
        if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <label style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15 }}>
          Upload Candidates CVs (Up to 3)
        </label>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={extracting || cvs.length >= 3}
          style={{
            background: "none",
            border: "1px solid var(--warm-gray-light)",
            borderRadius: 999,
            padding: "6px 14px",
            fontSize: 13,
            color: "var(--navy)",
            cursor: cvs.length >= 3 ? "not-allowed" : "pointer",
            opacity: cvs.length >= 3 ? 0.5 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {extracting ? "Reading files…" : "Upload PDF, Word, or .txt"}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = ""; 
          }}
        />
      </div>

      <div
        style={{
          width: "100%",
          minHeight: 120,
          border: `1.5px dashed ${dragOver ? "var(--mint)" : "var(--warm-gray-light)"}`,
          borderRadius: "var(--radius-md)",
          padding: 16,
          background: dragOver ? "var(--mint-soft)" : "var(--cream)",
          transition: "border-color 0.15s, background 0.15s",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {cvs.length === 0 ? (
          <p style={{ color: "var(--warm-gray)", fontSize: 14, textAlign: "center", margin: "auto" }}>
            Drag & drop up to 3 CVs here
          </p>
        ) : (
          cvs.map((cv) => (
            <div key={cv.id} style={{ display: "flex", justifyContent: "space-between", background: "var(--white)", padding: "10px 14px", borderRadius: 6, border: "1px solid var(--warm-gray-light)" }}>
              <span style={{ fontSize: 14, color: "var(--navy)", fontWeight: 500 }}>📄 {cv.name}</span>
              <button onClick={() => removeCv(cv.id)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 13 }}>Remove</button>
            </div>
          ))
        )}
      </div>

      {fileError && (
        <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{fileError}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <span style={{ fontSize: 13, color: "var(--warm-gray)" }}>
          {cvs.length} / 3 Candidates added
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || extracting || cvs.length === 0}
          style={{
            background: loading || extracting || cvs.length === 0 ? "var(--warm-gray-light)" : "var(--navy)",
            color: loading || extracting || cvs.length === 0 ? "var(--warm-gray)" : "var(--white)",
            border: "none",
            borderRadius: 999,
            padding: "12px 26px",
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: 14.5,
            cursor: loading || extracting || cvs.length === 0 ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {loading ? "Analyzing Candidates…" : "Compare Candidates"}
        </button>
      </div>
    </div>
  );
}