import type { CSSProperties } from "react";

export const pageLayoutStyles: Record<string, CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", flexDirection: "column" },
  content: {
    flex: 1,
    padding: "2rem",
    maxWidth: "560px",
    margin: "0 auto",
    width: "100%",
  },
  h1: { marginBottom: "0.5rem", fontSize: "1.5rem" },
  subtitle: { color: "var(--muted)", marginBottom: "1.5rem", fontSize: "0.9rem" },
  form: { display: "flex", flexDirection: "column", gap: "1rem" },
  row: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  label: { fontSize: "0.875rem", color: "var(--muted)" },
  input: {
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
  },
  button: {
    marginTop: "0.5rem",
    padding: "0.75rem 1.5rem",
    background: "var(--accent)",
    color: "var(--bg)",
    border: "none",
    borderRadius: "8px",
    fontWeight: 600,
  },
  error: {
    marginTop: "1rem",
    padding: "1rem",
    background: "rgba(255,71,87,0.15)",
    border: "1px solid var(--danger)",
    borderRadius: "8px",
    color: "var(--danger)",
  },
};
