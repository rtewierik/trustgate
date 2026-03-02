"use client";

import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { VerificationResultCard, type VerificationResultCardData } from "@/components/VerificationResultCard";
import { API_BASE } from "@/lib/api";
import { pageLayoutStyles } from "@/lib/layoutStyles";

interface VerificationResult extends VerificationResultCardData {
  verification_id: string;
  status: string;
  subject: { phone_number: string; country: string };
  created_at: string;
}

export default function HistoryPage() {
  const [verificationId, setVerificationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationResult | null>(
    null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setVerification(null);
    const id = verificationId.trim();
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/completed-verifications/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Not found");
      setVerification(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const s = pageLayoutStyles;
  return (
    <main style={s.main}>
      <AppHeader />
      <div style={s.content}>
        <h1 style={s.h1}>Consultar verificación</h1>
        <p style={s.subtitle}>
          Introduce el <em>verification_id</em> devuelto al iniciar una verificación para ver el resultado.
        </p>

        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.row}>
            <label style={s.label}>Verification ID</label>
            <input
              type="text"
              value={verificationId}
              onChange={(e) => setVerificationId(e.target.value)}
              placeholder="ej. 550e8400-e29b-41d4-a716-446655440000"
              style={s.input}
            />
          </div>
          <button type="submit" disabled={loading} style={s.button}>
            {loading ? "Buscando…" : "Buscar"}
          </button>
        </form>

        {error && <div style={s.error}>{error}</div>}

        {verification && (
          <div style={{ marginTop: "2rem" }}>
            <VerificationResultCard
              verification={verification}
              showSubject={true}
              showCreatedAt={true}
            />
          </div>
        )}
      </div>
    </main>
  );
}
