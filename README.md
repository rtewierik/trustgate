# TrustGate — Verificación de Identidad Instantánea por Red Telecom

> El KYC del futuro no pide documentos. Pregunta a la red.

API + dashboard en una sola app Next.js: verificación de identidad en &lt; 2 segundos usando datos de la red telecom (CAMARA / Nokia Network as Code): **Number Verification**, **SIM Swap** y **KYC Match**. Sin documentos, sin fricción.

- **Plataforma:** una app Next.js (frontend + API) desplegada con **Firebase App Hosting**
- **Base de datos:** Firestore  
- **Deploy:** un solo comando (`firebase deploy`); un único build de TS → front y back desde los mismos artefactos.

**Proyecto configurado:** Open Gateway Hackathon-512 — Project ID `openg-hack26bar-512` (number 243016898355).

---

## Requisitos

- Node.js 18+
- [Firebase CLI](https://firebase.google.com/docs/cli) 14.4+ (para deploy desde fuente a App Hosting)
- Proyecto en plan **Blaze** (para Firebase App Hosting)
- Cuenta en [Nokia Network as Code](https://networkascode.nokia.io/) (opcional; sin API key se usan mocks)

---

## Setup rápido

### 1. Clonar e instalar

```bash
cd trustgate
npm install
```

### 2. Proyecto Firebase

El proyecto por defecto está en `.firebaserc`: **Open Gateway Hackathon-512** (`openg-hack26bar-512`). Para otro proyecto:

```bash
firebase use <tu-project-id>
```

Activa **Firestore** en [Firebase Console](https://console.firebase.google.com/project/openg-hack26bar-512).

### 3. Crear un backend de App Hosting (una vez)

En [Firebase Console](https://console.firebase.google.com/project/openg-hack26bar-512/apphosting) → **App Hosting** → **Create backend** (o **Get started**).

- **App’s root directory:** `/` (raíz del repo) o el path donde está `package.json`.
- **Live branch:** p. ej. `main`.
- Opcional: conectar un repo de GitHub para rollouts automáticos.

Anota el **Backend ID** que te asigne (p. ej. `trustgate`). Si no coincide con el de `firebase.json`, edita `firebase.json` → `apphosting[0].backendId`.

Alternativa por CLI:

```bash
firebase apphosting:backends:create --project openg-hack26bar-512
```

y luego pon el `backendId` devuelto en `firebase.json`.

### 4. Variables de entorno

- **Local:** crea `.env.local` en la raíz con `GOOGLE_CLOUD_PROJECT=openg-hack26bar-512` (y opcionalmente `FIREBASE_SERVICE_ACCOUNT_JSON`, `NAC_API_KEY`).
- **App Hosting:** en `apphosting.yaml` está `GOOGLE_CLOUD_PROJECT`. Para secrets (p. ej. `NAC_API_KEY`), usa [Cloud Secret Manager](https://firebase.google.com/docs/app-hosting/configure#store-and-access-secret-parameters) y referencias en `apphosting.yaml`, o configúralos en Firebase Console → App Hosting → tu backend → Environment.

---

## Desarrollo local

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). El dashboard llama a `/api/...` en el mismo origen (misma app).

### Probar todo en local con emuladores

Para usar **Firestore emulator** (sin tocar producción):

1. **Terminal 1** — arranca solo el emulador de Firestore (y la UI de emuladores):

   ```bash
   firebase emulators:start --only firestore
   ```

   Firestore en `localhost:8080`, Emulator UI en `http://localhost:4000`.

2. **Terminal 2** — arranca la app apuntando al emulador:

   ```bash
   npm run dev:emulator
   ```

   Esto pone `FIRESTORE_EMULATOR_HOST=localhost:8080` y ejecuta `next dev`. La app usa el Firestore emulado; las verificaciones se guardan y listan solo en local.

Si prefieres no usar el script, en la segunda terminal:

```bash
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run dev
```

La configuración de emuladores está en `firebase.json` → `emulators` (firestore en 8080, UI en 4000, `singleProjectMode: true`).

---

## Deploy (Firebase App Hosting + Firestore)

Con el proyecto seleccionado y el backend de App Hosting ya creado:

```bash
npm run deploy
```

o:

```bash
firebase deploy
```

Esto despliega:

1. **App Hosting** — sube el código, Cloud Build compila el Next.js (un build de TS para front y API), despliega a Cloud Run y CDN.
2. **Firestore rules** — actualiza las reglas.

La URL de la app aparece en Firebase Console → App Hosting → tu backend (formato tipo `https://<backend-id>--<project-id>.<region>.hosted.app`).

---

## Contrato del API

Misma app = mismo dominio; las rutas de API son relativas.

### POST /api/v1/verifications

Crea una verificación. Body de ejemplo:

```json
{
  "subject": { "phone_number": "+34XXXXXXXXX", "country": "ES" },
  "claims": { "given_name": "Ada", "family_name": "Lovelace", "date_of_birth": "1995-05-10" },
  "checks": ["number_verification", "sim_swap", "kyc_match"],
  "policy": { "min_trust_score": 75, "sim_swap_max_age_hours": 72 }
}
```

Respuesta: `verification_id`, `status`, `trust_score`, `decision`, `checks`, `expires_at`.

### GET /api/v1/verifications

Lista verificaciones. Query: `?limit=50`.

### GET /api/v1/verifications/:id

Devuelve una verificación por ID.

### GET /api/health

Health check.

---

## Estructura del repo

```
trustgate/
├── app/                 # Next.js App Router
│   ├── layout.tsx       # Layout + globals
│   ├── page.tsx         # Landing
│   ├── dashboard/       # Formulario verificación + Trust Score
│   ├── history/         # Tabla historial
│   └── api/             # API routes (/api/health, /api/v1/verifications)
├── lib/                 # firestore, nac (Nokia), trust-score
├── apphosting.yaml      # App Hosting: runConfig, env
├── firebase.json        # apphosting + firestore
├── firestore.rules
├── scripts/deploy.js
└── package.json
```

Un único código TypeScript; front y back se sirven desde el mismo despliegue en Firebase App Hosting.

---

## Nokia Network as Code

Para usar las APIs reales (SIM Swap, Number Verification, KYC Match):

- Añade `NAC_API_KEY` (y si aplica `NAC_BASE_URL`) como variable de entorno en App Hosting o como secret en `apphosting.yaml`.
- Sin `NAC_API_KEY`, el backend usa mocks y el flujo y Trust Score siguen funcionando para demo.

---

## Licencia

MIT.
