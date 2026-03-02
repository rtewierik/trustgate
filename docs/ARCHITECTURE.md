# TrustGate — Architecture (Technical Pitch)

TrustGate is an identity verification solution that uses **telecom network data** (CAMARA / Nokia Network as Code) instead of document uploads. One verification request at a time: **initiate** → user completes operator redirect → **callback** runs all checks and persists one **completed verification**; clients query by ID.

---

## High-level architecture

```mermaid
flowchart TB
  subgraph Client["Client / Your app"]
    UI[Web or mobile UI]
  end

  subgraph TrustGate["TrustGate (Next.js)"]
    API[API routes]
    Init[POST /v1/verifications/initiate]
    Callback[GET .../number-verification/callback]
    Completed[GET /v1/completed-verifications]
    API --> Init
    API --> Callback
    API --> Completed
  end

  subgraph Firebase["Firebase"]
    Firestore[(Firestore)]
    Firestore --> Req[number_verification_requests]
    Firestore --> Ver[verifications]
  end

  subgraph NAC["Nokia Network as Code (CAMARA)"]
    Auth[Authorization / Number Verification]
    SimSwap[SIM Swap API]
    KYC[KYC Match API]
  end

  UI -->|"1. Initiate (subject, redirect_uri)"| Init
  Init -->|Store request| Req
  Init -->|authorization_url + state| UI
  UI -->|"2. User opens authorization_url"| Auth
  Auth -->|"3. Redirect with code + state"| Callback
  Callback -->|Load request| Req
  Callback -->|Number verify| Auth
  Callback -->|SIM swap + KYC| SimSwap
  Callback -->|SIM swap + KYC| KYC
  Callback -->|Save result| Ver
  Callback -->|Update request| Req
  Callback -->|Redirect user| UI
  UI -->|"4. Get result (state or id)"| Completed
  Completed -->|Read| Req
  Completed -->|Read| Ver
```

**Deployment:** TrustGate runs as a single Next.js app on **Firebase App Hosting** (Cloud Run + CDN). Firestore holds request state and completed verifications. No document storage; no separate backend service.

---

## Verification flow (sequence)

```mermaid
sequenceDiagram
  participant C as Client
  participant T as TrustGate API
  participant F as Firestore
  participant O as Operator (NAC)
  participant N as NAC APIs (SIM Swap, KYC)

  C->>T: POST /v1/verifications/initiate (subject, redirect_uri, claims, policy)
  T->>F: Save number_verification_requests[state] (pending)
  T->>O: createAuthorizationLink(phone, callbackUrl, state)
  O-->>T: authorization_url
  T-->>C: authorization_url, verification_request_id (state)

  C->>C: Redirect user to authorization_url
  C->>O: User completes operator flow
  O->>T: GET .../callback?code=...&state=...
  T->>F: Load request by state
  T->>O: device.verifyNumber(code, state)
  O-->>T: verified
  T->>N: simSwap(phone), kycMatch(phone, claims)
  N-->>T: swapped, match_level
  T->>T: computeTrustScore(numVer, simSwap, kyc) → decision
  T->>F: Save verifications[verification_id]
  T->>F: Update request (completed, verification_id)
  T-->>C: Redirect to redirect_uri?state=...&verification_id=...&status=...

  C->>T: GET /v1/completed-verifications?state=... (or /:id)
  T->>F: Get verification by state or id
  F-->>T: verification
  T-->>C: Single verification object
```

---

## Data model

```mermaid
erDiagram
  number_verification_requests {
    string state PK "verification_request_id"
    string phone_number
    string country
    string redirect_uri
    string status "pending | completed | failed"
    boolean verified
    string verification_id FK "set in callback"
    object subject
    object claims
    object checks
    object policy
    string created_at
    string completed_at
  }

  verifications {
    string verification_id PK
    string request_id
    object subject
    object claims
    array checks
    object policy
    string status "approved | denied"
    number trust_score
    string decision "allow | deny"
    array check_results
    string expires_at
    string created_at
  }

  number_verification_requests ||--o| verifications : "verification_id"
```

- **number_verification_requests:** One document per initiated verification (key = `state`). Stores full request so the callback can run SIM swap + KYC after number verification. Updated to `completed` / `failed` and linked to `verification_id` when the callback finishes.
- **verifications:** One document per completed verification (key = `verification_id`). Written only by the callback. Queried by `state` (via request) or by `verification_id`.

---

## Trust score and CAMARA checks

```mermaid
flowchart LR
  subgraph Inputs["Inputs (per verification)"]
    NumVer[Number verification]
    SimSwap[SIM Swap]
    KycMatch[KYC Match]
  end

  subgraph Policy["Policy"]
    MinScore[min_trust_score]
    SimMaxHours[sim_swap_max_age_hours]
  end

  subgraph Logic["computeTrustScore"]
    C1[number_verification: pass/fail]
    C2[sim_swap: not swapped + age ≥ threshold]
    C3[kyc_match: match + level high/medium]
    Score[Score: 35+35+30, decision allow/deny]
  end

  NumVer --> C1
  SimSwap --> C2
  KycMatch --> C3
  MinScore --> Score
  SimMaxHours --> C2
  C1 --> Score
  C2 --> Score
  C3 --> Score
```

| Check | Weight | Pass condition |
|-------|--------|----------------|
| Number verification | 35 | Device verified via operator redirect |
| SIM Swap | 35 | No recent swap (configurable max age in hours) |
| KYC Match | 30 (or 15 if match but low level) | Identity claims match operator data (level high/medium) |

**Decision:** `allow` if total score ≥ `min_trust_score` (default 75); otherwise `deny`.

---

## Component map

| Layer | Components |
|-------|------------|
| **API** | `POST /v1/verifications/initiate`, `GET .../number-verification/callback`, `GET /v1/completed-verifications?state=`, `GET /v1/completed-verifications/:id` |
| **Lib** | `nac` (Nokia SDK: number verification, SIM swap, KYC), `trust-score` (score + decision), `firestore` (requests + verifications) |
| **Storage** | Firestore: `number_verification_requests`, `verifications` |
| **External** | Nokia Network as Code (RapidAPI): authorization + number verification, SIM swap, KYC match |
| **Hosting** | Firebase App Hosting (Next.js on Cloud Run), Firestore |

---

## How to use this for a pitch

1. **High-level diagram** — Show client, TrustGate, Firebase, and NAC; emphasize “one app, one verification at a time, query by ID.”
2. **Sequence diagram** — Walk through: initiate → auth link → user at operator → callback runs all three CAMARA checks → trust score → one saved verification → client fetches by state or id.
3. **Data model** — Explain request table (by state) vs completed verification table (by verification_id); no list, only single-verification lookup.
4. **Trust score** — Show the three checks and how the policy drives allow/deny.

Mermaid renders in GitHub, GitLab, and many doc tools; you can also export to PNG/SVG via [Mermaid Live](https://mermaid.live) or your IDE for slides.
