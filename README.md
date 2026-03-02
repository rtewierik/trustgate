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

   Esto pone `FIRESTORE_EMULATOR_HOST=localhost:8080` y ejecuta `next dev`. La app usa el Firestore emulado; las verificaciones se guardan en local y se consultan por state o verification_id.

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

Misma app = mismo dominio; las rutas de API son relativas. **Cada petición trata una sola verificación:** no hay listados; se consulta por identificador (state o verification_id).

### Flujo de verificación

1. **Iniciar** — `POST /api/v1/verifications/initiate` con subject, redirect_uri, etc. Respuesta: `authorization_url` y `verification_request_id` (state).
2. **Redirect** — El usuario abre `authorization_url` y completa el flujo en el operador. Vuelve a tu `redirect_uri` con `state` y `verification_id` en la URL.
3. **Resultado** — El callback interno escribe **un** registro de verificación completada. Para obtenerlo: `GET` por `state` (verification_request_id) o por `verification_id`.

### POST /api/v1/verifications/initiate

Inicia **una** verificación: guarda la petición y devuelve el enlace de autorización. Body de ejemplo:

```json
{
  "subject": { "phone_number": "+34XXXXXXXXX", "country": "ES" },
  "redirect_uri": "https://tu-app/dashboard",
  "claims": { "given_name": "Ada", "family_name": "Lovelace", "date_of_birth": "1995-05-10" },
  "checks": ["number_verification", "sim_swap", "kyc_match"],
  "policy": { "min_trust_score": 75, "sim_swap_max_age_hours": 72 }
}
```

**Respuesta:** `authorization_url`, `verification_request_id` (usar como `state` al consultar), `message`. Sin listados ni límites; una petición = un proceso de verificación.

### GET /api/v1/completed-verifications?state=&lt;verification_request_id&gt;

Devuelve **la** verificación completada para esa petición. **Requerido:** query `state` (el `verification_request_id` devuelto en initiate). Respuesta: un único objeto de verificación (campos completos). Sin `state` responde 400.

### GET /api/v1/completed-verifications/:id

Devuelve **una** verificación completada por `verification_id` (path). Un único objeto de verificación. No hay endpoint de listado; solo consulta por ID (state o verification_id).

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
│   ├── history/         # Consultar una verificación por verification_id o state
│   └── api/             # API: health, verification/initiate, completed-verifications (por state o :id)
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
