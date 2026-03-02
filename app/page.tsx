import Link from "next/link";

export default function LandingPage() {
  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <span style={styles.logo}>TrustGate</span>
        <nav style={styles.nav}>
          <Link href="/dashboard/">Dashboard</Link>
          <Link href="/history/">History</Link>
        </nav>
      </header>

      <section style={styles.hero}>
        <h1 style={styles.h1}>
          The KYC of the future does not ask for documents.
          <br />
          <span style={styles.h1Accent}>Ask the network.</span>
        </h1>
        <p style={styles.subtitle}>
          Identity verification in less than 2 seconds with data that the telecom network already has.
          No documents, no friction.
        </p>
        <div style={styles.ctas}>
          <Link href="/dashboard/" style={styles.primaryCta}>
            Try demo
          </Link>
          <a href="#how" style={styles.secondaryCta}>
            How it works
          </a>
        </div>
      </section>

      <section id="how" style={styles.section}>
        <h2 style={styles.h2}>How it works</h2>
        <div style={styles.cards}>
          <div style={styles.card}>
            <strong>1. NNumber + Details</strong>
            <p>The user enters their phone number and name/date of birth.</p>
          </div>
          <div style={styles.card}>
            <strong>2. Three Checks</strong>
            <p>Number Verification, SIM Swap and KYC Match in parallel via CAMARA.</p>
          </div>
          <div style={styles.card}>
            <strong>3. Trust Score</strong>
            <p>Allow/Deny and score 0–100 in seconds.</p>
          </div>
        </div>
      </section>

      <footer style={styles.footer}>
        <p>TrustGate — Open Gateway Hackathon 2026 (Team 12)</p>
      </footer>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: { minHeight: "100vh", display: "flex", flexDirection: "column" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1rem 2rem",
    borderBottom: "1px solid var(--border)",
  },
  logo: { fontSize: "1.25rem", fontWeight: 700, color: "var(--accent)" },
  nav: { display: "flex", gap: "1.5rem" },
  hero: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "3rem 2rem",
    textAlign: "center",
  },
  h1: { fontSize: "clamp(1.75rem, 4vw, 2.5rem)", marginBottom: "1rem", fontWeight: 600 },
  h1Accent: { color: "var(--accent)" },
  subtitle: { color: "var(--muted)", maxWidth: "42ch", marginBottom: "2rem" },
  ctas: { display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" },
  primaryCta: {
    background: "var(--accent)",
    color: "var(--bg)",
    padding: "0.75rem 1.5rem",
    borderRadius: "8px",
    fontWeight: 600,
  },
  secondaryCta: {
    border: "1px solid var(--border)",
    padding: "0.75rem 1.5rem",
    borderRadius: "8px",
    color: "var(--text)",
  },
  section: { padding: "4rem 2rem", borderTop: "1px solid var(--border)" },
  h2: { textAlign: "center", marginBottom: "2rem", fontSize: "1.5rem" },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "1.5rem",
    maxWidth: "900px",
    margin: "0 auto",
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "1.5rem",
  },
  footer: {
    padding: "1.5rem 2rem",
    borderTop: "1px solid var(--border)",
    color: "var(--muted)",
    fontSize: "0.875rem",
    textAlign: "center",
  },
};
