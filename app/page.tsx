import Link from "next/link";

export default function LandingPage() {
  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <span style={styles.logo}>TrustGate</span>
        <nav style={styles.nav}>
          <Link href="/history/">Historial</Link>
        </nav>
      </header>

      <section style={styles.hero}>
        <div style={styles.heroBg} aria-hidden />
        <div style={styles.heroContent}>
          <h1 style={styles.h1}>
            El KYC del futuro no pide documentos.
            <br />
            <span style={styles.h1Accent}>Pregunta a la red.</span>
          </h1>
          <p style={styles.subtitle}>
            Verificación de identidad en menos de 2 segundos con datos que la red telecom ya tiene.
            Sin documentos, sin fricción.
          </p>
          <Link href="/demo/" className="hero-cta" style={styles.primaryCta}>
            Probar demo
          </Link>
          <a href="#how" className="hero-scroll-hint" style={styles.scrollHint}>
            Cómo funciona ↓
          </a>
        </div>
      </section>

      <section id="how" style={styles.section}>
        <h2 style={styles.h2}>Cómo funciona</h2>
        <div style={styles.cards}>
          <div style={styles.card}>
            <span style={styles.cardNum}>1</span>
            <strong>Número + datos</strong>
            <p>El usuario introduce su teléfono y nombre/fecha de nacimiento.</p>
          </div>
          <div style={styles.card}>
            <span style={styles.cardNum}>2</span>
            <strong>Tres comprobaciones</strong>
            <p>Number Verification, SIM Swap y KYC Match en paralelo vía CAMARA.</p>
          </div>
          <div style={styles.card}>
            <span style={styles.cardNum}>3</span>
            <strong>Trust Score</strong>
            <p>Allow/Deny y puntuación 0–100 en segundos.</p>
          </div>
        </div>
      </section>

      <footer style={styles.footer}>
        <p>TrustGate — Open Gateway Hackathon 2026</p>
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
    position: "relative",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "4rem 2rem",
    textAlign: "center",
    overflow: "hidden",
  },
  heroBg: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0, 212, 170, 0.08) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(0, 212, 170, 0.04) 0%, transparent 40%)",
    pointerEvents: "none",
  },
  heroContent: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    maxWidth: "36rem",
  },
  h1: {
    fontSize: "clamp(2rem, 5vw, 3rem)",
    marginBottom: "1.25rem",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
  },
  h1Accent: { color: "var(--accent)" },
  subtitle: {
    color: "var(--muted)",
    maxWidth: "42ch",
    marginBottom: "2.5rem",
    fontSize: "1.0625rem",
    lineHeight: 1.6,
  },
  primaryCta: {
    display: "inline-block",
    background: "var(--accent)",
    color: "var(--bg)",
    padding: "1rem 2rem",
    borderRadius: "12px",
    fontWeight: 600,
    fontSize: "1.125rem",
    textDecoration: "none",
    boxShadow: "0 0 0 0 rgba(0, 212, 170, 0.4)",
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
  },
  scrollHint: {
    marginTop: "1.5rem",
    fontSize: "0.875rem",
    color: "var(--muted)",
    textDecoration: "none",
  },
  section: {
    padding: "4rem 2rem",
    borderTop: "1px solid var(--border)",
    background: "var(--surface)",
  },
  h2: {
    textAlign: "center",
    marginBottom: "2.5rem",
    fontSize: "1.5rem",
    fontWeight: 600,
    color: "var(--text)",
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "1.5rem",
    maxWidth: "920px",
    margin: "0 auto",
  },
  card: {
    position: "relative",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "16px",
    padding: "1.75rem 1.75rem 1.75rem 3.5rem",
  },
  cardNum: {
    position: "absolute",
    left: "1rem",
    top: "1.5rem",
    width: "1.75rem",
    height: "1.75rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--accent)",
    color: "var(--bg)",
    borderRadius: "50%",
    fontSize: "0.875rem",
    fontWeight: 700,
  },
  footer: {
    padding: "1.5rem 2rem",
    borderTop: "1px solid var(--border)",
    color: "var(--muted)",
    fontSize: "0.875rem",
    textAlign: "center",
  },
};
