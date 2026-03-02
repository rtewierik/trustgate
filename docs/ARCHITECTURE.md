# TrustGate — Architecture (Technical Pitch)

TrustGate is an identity verification solution that uses **telecom network data** (CAMARA / Nokia Network as Code) instead of document uploads. One verification request at a time: **initiate** → user completes operator redirect → **callback** runs all checks and persists one **completed verification**; clients query by ID.

---

## High-level architecture

One verification flow in three phases. **Platform** = your app + TrustGate + Firestore. **Nokia** = Network as Code (operator auth, SIM swap, KYC). Eyes follow top → down; phases are color-coded.

```mermaid
flowchart TB
  subgraph PHASE1["1. Init — create request & auth link"]
    direction LR
    P1A[Client: POST /initiate]
    P1B[TrustGate: save to Firestore]
    P1C[Nokia: create auth link]
    P1D[TrustGate: return auth_url + state]
    P1A --> P1B --> P1C --> P1D
  end

  subgraph PHASE2["2. Number verification — user at operator"]
    direction LR
    P2A[User opens auth_url]
    P2B[Nokia: user verifies device]
    P2C[Nokia redirects to callback with code]
    P2A --> P2B --> P2C
  end

  subgraph PHASE3["3. Callback & result — checks + decision"]
    direction LR
    P3A[Callback: load request, verify number with Nokia]
    P3B[Nokia: SIM swap + KYC]
    P3C[TrustGate: trust score, save verification]
    P3D[Redirect user; Client GET /completed-verifications]
    P3A --> P3B --> P3C --> P3D
  end

  PHASE1 ==> PHASE2 ==> PHASE3

  style PHASE1 fill:#E3F2FD,stroke:#1976D2
  style PHASE2 fill:#E8F5E9,stroke:#388E3C
  style PHASE3 fill:#FFF3E0,stroke:#F57C00
```

**Platform vs Nokia:** In **Init**, TrustGate calls Nokia to obtain the `authorization_url`. In **Number verification**, the user interacts only with Nokia; Nokia then redirects to TrustGate. In **Callback & result**, TrustGate calls Nokia for number verification, SIM swap, and KYC, then decides and persists the result.

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
  T->>F: Save verifications[state] (status: pending)
  T->>O: createAuthorizationLink(phone, callbackUrl, state)
  O-->>T: authorization_url
  T-->>C: authorization_url, verification_id (used as OAuth state)

  C->>C: Redirect user to authorization_url
  C->>O: User completes operator flow
  O->>T: GET .../callback?code=...&state=...
  T->>F: Load verifications[state]
  T->>O: device.verifyNumber(code, state)
  O-->>T: verified
  T->>N: simSwap(phone), kycMatch(phone, claims)
  N-->>T: swapped, match_level
  T->>T: computeTrustScore(numVer, simSwap, kyc) → decision
  T->>F: Update verifications[state] (status: approved/denied, trust_score, check_results)
  T-->>C: Redirect to redirect_uri?state=...&verification_id=...&status=...

  C->>T: GET /v1/completed-verifications?state=... (or /:id)
  T->>F: Get verification by id (state = verification_id)
  F-->>T: verification
  T-->>C: Single verification object
```

---

## Data model

A single **verifications** collection holds the full lifecycle. Document ID = `verification_id` = `state` (the value returned from initiate).

```mermaid
erDiagram
  verifications {
    string verification_id PK "doc ID = state"
    object subject
    object claims
    array checks
    object policy
    string status "pending | approved | denied"
    string redirect_uri "set at initiate"
    number trust_score "set in callback"
    string decision "allow | deny"
    array check_results
    string expires_at
    string created_at
    string completed_at "set in callback"
    string error "set in callback on failure"
  }
```

- **verifications:** One document per verification. Created at **initiate** with `status: "pending"` and `redirect_uri`. The **callback** loads by `state` (doc ID), runs number verification + SIM swap + KYC, then updates the same document to `status: "approved"` or `"denied"` with `trust_score`, `decision`, `check_results`, and `completed_at`. Queried by `verification_id` (same as state).

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
| **Lib** | `nac` (Nokia SDK: number verification, SIM swap, KYC), `trust-score` (score + decision), `firestore` (verifications: save, get, update) |
| **Storage** | Firestore: `verifications` (single collection; status pending → approved/denied in callback) |
| **External** | Nokia Network as Code (RapidAPI): authorization + number verification, SIM swap, KYC match |
| **Hosting** | Firebase App Hosting (Next.js on Cloud Run), Firestore |

---

## How to use this for a pitch

1. **High-level diagram** — Show client, TrustGate, Firebase, and NAC; emphasize “one app, one verification at a time, query by ID.”
2. **Sequence diagram** — Walk through: initiate → auth link → user at operator → callback runs all three CAMARA checks → trust score → one saved verification → client fetches by state or id.
3. **Data model** — Single verifications collection; document ID = verification_id = state; status moves from pending to approved/denied in the callback; no list, only single-verification lookup.
4. **Trust score** — Show the three checks and how the policy drives allow/deny.

Mermaid renders in GitHub, GitLab, and many doc tools; you can also export to PNG/SVG via [Mermaid Live](https://mermaid.live) or your IDE for slides.
