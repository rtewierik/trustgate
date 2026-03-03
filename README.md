# TrustGate — Instant Identity Verification via Telecom Network

> The KYC of the future does not ask for documents. Ask the network.

API + dashboard in a single Next.js app: identity verification in &lt; 2 seconds using telecom network data (CAMARA / Nokia Network as Code): **Number Verification**, **SIM Swap** and **KYC Match**. No documents, no friction.

📐 **[Architecture diagram](docs/ARCHITECTURE.md)** — Mermaid diagrams for technical pitch (flow, data, trust score).

- **Platform:** one Next.js app (frontend + API) deployed with **Firebase App Hosting**
- **Database:** Firestore  
- **Deploy:** single command (`firebase deploy`); one TS build → front and back from the same artifacts.

**Configured project:** Open Gateway Hackathon-512 — Project ID `openg-hack26bar-512` (number 243016898355).

---

## Requirements

- Node.js 18+
- [Firebase CLI](https://firebase.google.com/docs/cli) 14.4+ (for deploy from source to App Hosting)
- Project on **Blaze** plan (for Firebase App Hosting)
- Account on [Nokia Network as Code](https://networkascode.nokia.io/) (optional; without API key mocks are used)

---

## Quick setup

### 1. Clone and install

```bash
cd trustgate
npm install
```

### 2. Firebase project

The default project is in `.firebaserc`: **Open Gateway Hackathon-512** (`openg-hack26bar-512`). For another project:

```bash
firebase use <your-project-id>
```

Enable **Firestore** in [Firebase Console](https://console.firebase.google.com/project/openg-hack26bar-512).

### 3. Create an App Hosting backend (once)

In [Firebase Console](https://console.firebase.google.com/project/openg-hack26bar-512/apphosting) → **App Hosting** → **Create backend** (or **Get started**).

- **App's root directory:** `/` (repo root) or the path where `package.json` is.
- **Live branch:** e.g. `main`.
- Optional: connect a GitHub repo for automatic rollouts.

Note the **Backend ID** assigned (e.g. `trustgate`). If it does not match the one in `firebase.json`, edit `firebase.json` → `apphosting[0].backendId`.

CLI alternative:

```bash
firebase apphosting:backends:create --project openg-hack26bar-512
```

then put the returned `backendId` in `firebase.json`.

### 4. Environment variables

- **Local:** copy `.env.example` to `.env.local` and fill in (minimum `GOOGLE_CLOUD_PROJECT`; optional `FIREBASE_SERVICE_ACCOUNT_JSON`, `NAC_API_KEY`).
- **App Hosting:** in `apphosting.yaml` the **build** (BUILD) and **runtime** (RUNTIME) variables are defined. `GOOGLE_CLOUD_PROJECT` and `NEXT_PUBLIC_API_URL` are set so the Next.js build does not fail on missing variables. For secrets (e.g. `NAC_API_KEY`), use [Cloud Secret Manager](https://firebase.google.com/docs/app-hosting/configure#store-and-access-secret-parameters) and references in `apphosting.yaml`, or configure them in Firebase Console → App Hosting → your backend → Environment.
- **Firestore from deployed app:** the app on App Hosting uses Application Default Credentials (no service account key). The Cloud Run service must have the **Cloud Datastore User** role on the project. See [docs/IAM-FIRESTORE-APP-HOSTING.md](docs/IAM-FIRESTORE-APP-HOSTING.md) and `./scripts/grant-apphosting-firestore.sh`.

---

## Local development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dashboard calls `/api/...` on the same origin (same app).

### Test everything locally with emulators

To use the **Firestore emulator** (without touching production):

1. **Terminal 1** — start only the Firestore emulator (and emulator UI):

   ```bash
   firebase emulators:start --only firestore
   ```

   Firestore at `localhost:8080`, Emulator UI at `http://localhost:4000`.

2. **Terminal 2** — start the app pointing at the emulator:

   ```bash
   npm run dev:emulator
   ```

   This sets `FIRESTORE_EMULATOR_HOST=localhost:8080` and runs `next dev`. The app uses the emulated Firestore; verifications are stored locally and queried by state or verification_id.

If you prefer not to use the script, in the second terminal:

```bash
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run dev
```

Emulator configuration is in `firebase.json` → `emulators` (firestore on 8080, UI on 4000, `singleProjectMode: true`).

---

## Deploy (Firebase App Hosting + Firestore)

With the project selected and the App Hosting backend already created:

```bash
npm run deploy
```

or:

```bash
firebase deploy
```

This deploys:

1. **App Hosting** — uploads code, Cloud Build compiles Next.js (one TS build for front and API), deploys to Cloud Run and CDN.
2. **Firestore rules** — updates the rules.

The app URL appears in Firebase Console → App Hosting → your backend (format like `https://<backend-id>--<project-id>.<region>.hosted.app`).

---

## API contract

Same app = same domain; API routes are relative. **Each request handles a single verification:** there are no list endpoints; you query by identifier (state or verification_id).

### Verification flow

1. **Initiate** — `POST /api/v1/verifications/initiate` with subject, redirect_uri, etc. Response: `authorization_url` and `verification_id` (used as OAuth state).
2. **Redirect** — User opens `authorization_url` and completes the flow at the operator. Returns to your `redirect_uri` with `state` and `verification_id` in the URL (state = verification_id).
3. **Result** — The callback updates the same record in Firestore (status: pending → approved/denied). To fetch it: `GET` by `state` (verification_id) or by `verification_id`.

### POST /api/v1/verifications/initiate

Starts **one** verification: saves the request and returns the authorization link. Example body:

```json
{
  "subject": { "phone_number": "+34XXXXXXXXX", "country": "ES" },
  "redirect_uri": "https://your-app/dashboard",
  "claims": { "given_name": "Ada", "family_name": "Lovelace", "date_of_birth": "1995-05-10" },
  "checks": ["number_verification", "sim_swap", "kyc_match"],
  "policy": { "min_trust_score": 75, "sim_swap_max_age_hours": 72 }
}
```

**Response:** `authorization_url`, `verification_id` (used as state on redirect and when querying), `message`. No lists or limits; one request = one verification process.

### GET /api/v1/completed-verifications?state=&lt;verification_id&gt;

Returns **the** verification for that request. **Required:** query `state` (the `verification_id` returned from initiate). Response: single verification object (full fields). Without `state` returns 400.

### GET /api/v1/completed-verifications/:id

Returns **one** completed verification by `verification_id` (path). Single verification object. There is no list endpoint; only query by ID (state or verification_id).

### GET /api/health

Health check.

---

## Architecture

```
trustgate/
├── app/                 # Next.js App Router
│   ├── layout.tsx       # Layout + globals
│   ├── page.tsx         # Landing
│   ├── dashboard/       # Verification form + Trust Score
│   ├── history/         # Look up a verification by verification_id or state
│   └── api/             # API: health, verification/initiate, completed-verifications (by state or :id)
├── lib/                 # firestore, nac (Nokia), trust-score
├── apphosting.yaml      # App Hosting: runConfig, env
├── firebase.json        # apphosting + firestore
├── firestore.rules
├── scripts/deploy.js
└── package.json
```

Single TypeScript codebase; front and back are served from the same deployment on Firebase App Hosting.

---

## Nokia Network as Code

To use the real APIs (SIM Swap, Number Verification, KYC Match):

- Add `NAC_API_KEY` (and if applicable `NAC_BASE_URL`) as an environment variable in App Hosting or as a secret in `apphosting.yaml`.
- Without `NAC_API_KEY`, the backend uses mocks and the flow and Trust Score still work for demo.

---

## The Development Team
* **Aïda Ibrahim** - Project Owner - [LinkedIn Profile](https://www.linkedin.com/in/aidatechlaw/)
* **Ruben te Wierik** - Developer - [LinkedIn Profile](https://www.linkedin.com/in/rtewierik/)
* **Geovanny Tipan** - Developer - [LinkedIn Profile](https://www.linkedin.com/in/geovanny-tipan-taipe-47a2371a1/)
* **M. Ibrahim Saleem** - Developer - [LinkedIn Profile](https://www.linkedin.com/in/ibrahimmuhammaddd/)
* **Anna Costa** - Developer - [LinkedIn Profile](https://www.linkedin.com/in/annahico/)


## License

MIT.
