import Link from "next/link";

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1rem 2rem",
    borderBottom: "1px solid var(--border)",
  },
  logo: { fontSize: "1.25rem", fontWeight: 700, color: "var(--accent)" },
  nav: { display: "flex", gap: "1.5rem" },
};

export function AppHeader() {
  return (
    <header style={styles.header}>
      <Link href="/" style={styles.logo}>
        TrustGate
      </Link>
      <nav style={styles.nav}>
        <Link href="/history/">Historial</Link>
      </nav>
    </header>
  );
}
