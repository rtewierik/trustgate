# TrustGate — Verificación de Identidad Instantánea por Red Telecom

> El KYC del futuro no pide documentos. Pregunta a la red.

API SaaS + dashboard para verificar identidad en &lt; 2 segundos usando datos de la red telecom (CAMARA / Nokia Network as Code): **Number Verification**, **SIM Swap** y **KYC Match**. Sin documentos, sin fricción.

- **Backend (API):** Next.js → Google Cloud Run  
- **Frontend:** Next.js (static export) → Firebase Hosting  
- **Database:** Firestore  

Deploy con un solo comando (API + Web + Firestore rules) asumiendo que `gcloud` y `firebase` están autenticados en el host.

---

## Requisitos

- Node.js 18+
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) (`gcloud`) instalado y autenticado
- [Firebase CLI](https://firebase.google.com/docs/cli) instalado y autenticado
- Cuenta en [Nokia Network as Code](https://networkascode.nokia.io/) (opcional; sin API key el backend usa mocks)

---

## Setup rápido

### 1. Clonar e instalar

```bash
cd trustgate
npm install
```

### 2. Proyecto Google Cloud / Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/) (o usa uno existente).
2. En Firebase: activa **Firestore** (modo producción o prueba).
3. En la raíz del repo:

```bash
firebase use <tu-project-id>
```

### 3. Variables de entorno (API)

Para **desarrollo local** del API, crea `apps/api/.env.local`:

```bash
# Opcional: proyecto GCP (también se usa GOOGLE_CLOUD_PROJECT en Cloud Run)
GOOGLE_CLOUD_PROJECT=tu-project-id

# Opcional: credenciales Firebase para Firestore (solo si no usas gcloud auth)
# FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'

# Opcional: Nokia Network as Code (sin esto se usan mocks)
# NAC_API_KEY=tu-api-key
# NAC_BASE_URL=https://...
```

En **Cloud Run**, el proyecto se inyecta con `--set-env-vars GOOGLE_CLOUD_PROJECT=...`. Para Firestore desde Cloud Run suele bastar con las credenciales por defecto del servicio; si no, configura un service account y `FIREBASE_SERVICE_ACCOUNT_JSON` en el servicio.

### 4. Variables de entorno (Frontend)

Para que el dashboard llame al API desplegado, construye el frontend con la URL del API:

```bash
cd apps/web
NEXT_PUBLIC_API_URL=https://trustgate-api-xxxxx.run.app npm run build
```

O en `apps/web/.env.local`:

```
NEXT_PUBLIC_API_URL=https://trustgate-api-xxxxx.run.app
```

---

## Desarrollo local

```bash
# Terminal 1 — API (puerto 3001)
npm run dev:api

# Terminal 2 — Web (puerto 3000)
npm run dev:web
```

En el frontend, apunta al API local con `NEXT_PUBLIC_API_URL=http://localhost:3001` en `apps/web/.env.local`.

---

## Deploy (un solo comando)

Con el proyecto Firebase seleccionado (`firebase use <project-id>`) y auth configurada:

```bash
npm run deploy
```

Esto:

1. Construye el frontend (`apps/web`) y genera `apps/web/out`.
2. Despliega **Firestore rules** y **Firebase Hosting** (web).
3. Despliega el **API** (Next.js) en **Cloud Run** desde `apps/api` (Dockerfile).

O por partes:

```bash
npm run deploy:api   # Solo Cloud Run (API)
npm run deploy:web   # Solo Firebase Hosting (web)
```

Tras el primer deploy del API, copia la URL de Cloud Run, ponla en `NEXT_PUBLIC_API_URL`, vuelve a construir y desplegar la web:

```bash
NEXT_PUBLIC_API_URL=https://trustgate-api-xxxxx.run.app npm run build:web
npm run deploy:web
```

---

## Contrato del API

### POST /api/v1/verifications

Crea una verificación (síncrona). Body de ejemplo:

```json
{
  "request_id": "uuid-opcional",
  "subject": {
    "phone_number": "+34XXXXXXXXX",
    "country": "ES"
  },
  "claims": {
    "given_name": "Ada",
    "family_name": "Lovelace",
    "date_of_birth": "1995-05-10"
  },
  "checks": ["number_verification", "sim_swap", "kyc_match"],
  "policy": {
    "min_trust_score": 75,
    "sim_swap_max_age_hours": 72
  }
}
```

Respuesta (ejemplo):

```json
{
  "verification_id": "ver_...",
  "status": "approved",
  "trust_score": 92,
  "decision": "allow",
  "checks": [
    { "name": "number_verification", "status": "pass" },
    { "name": "sim_swap", "status": "pass", "detail": { "last_swap_hours_ago": 600 } },
    { "name": "kyc_match", "status": "pass", "detail": { "match_level": "high" } }
  ],
  "expires_at": "2026-03-02T13:30:00Z"
}
```

### GET /api/v1/verifications

Lista verificaciones (para el historial). Query: `?limit=50`.

### GET /api/v1/verifications/:id

Devuelve una verificación por ID.

### GET /api/health

Health check del servicio.

---

## Estructura del repo

```
trustgate/
├── apps/
│   ├── api/          # Next.js API (Cloud Run)
│   │   ├── app/api/  # Rutas /api/v1/verifications, /api/health
│   │   ├── lib/      # firestore, nac (Nokia), trust-score
│   │   └── Dockerfile
│   └── web/          # Next.js frontend (Firebase Hosting)
│       └── app/      # landing, dashboard, history
├── firebase.json
├── firestore.rules
├── scripts/
│   ├── deploy.js     # deploy completo
│   ├── deploy-api.js
│   └── deploy-web.js
└── package.json      # workspaces
```

---

## Bonus: Nokia Network as Code

Para usar las APIs reales (SIM Swap, Number Verification, KYC Match), configura en el API (env o Cloud Run):

- `NAC_API_KEY` — API key del hub [Network as Code](https://networkascode.nokia.io/).
- `NAC_BASE_URL` — Base URL del API (por defecto se usa un placeholder; revisa la documentación del hub para la URL correcta).

Sin `NAC_API_KEY`, el backend responde con mocks (permite probar el flujo y el Trust Score).

---

## Licencia

MIT.
