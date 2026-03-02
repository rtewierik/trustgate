export default function ApiRoot() {
  return (
    <html>
      <body>
        <h1>TrustGate API</h1>
        <p>Use POST /api/v1/verifications to verify identity.</p>
        <p><a href="/api/health">Health check</a></p>
      </body>
    </html>
  );
}
