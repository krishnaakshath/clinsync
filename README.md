# Clinsync — IPMG Research Pre-Screening Workbook (Pilot Demo)

**⚠️ PILOT / DEMO — no real patient data.** This is a clickable prototype for
a client engagement (Symbiosys Technologies → Inland Psychiatric Medical
Group), built to demonstrate the product before real IntakeQ/Tebra API
credentials exist. All patient data is fictional, seeded from
`src/db/seed.ts`. Every screen carries a persistent "PILOT / DEMO" banner so
it can never be mistaken for production.

## What it does

Clinsync combines referral data from **IntakeQ** and clinical chart data
from **Tebra** (both read-only, both mocked here — see
`src/connectors/*.mock.ts`) into a single review workbook for research
coordinators. A rule engine screens each patient against a trial's
criteria and marks every criterion:

- 🟢 **Meets** — chart evidence clearly satisfies the criterion
- 🟡 **Needs Verification** — evidence is missing, ambiguous, or the
  sources disagree
- 🔴 **Potential Exclusion** — chart evidence clearly disqualifies

Every verdict is backed by the exact chart quote it was derived from —
never a summary, never a guess. **The rule engine never invents a "meets"
or "excludes" verdict from absent evidence: an empty evidence set always
defaults to yellow** (`src/lib/rule-engine.ts`). Humans — CRC coordinators
first, then the PI — always make the actual eligibility call; the app only
ever proposes.

Trial criteria (diagnosis codes, rating scales, medication washout rules,
age range) are **data on the `trials` table, not code** — see the JSONB
columns in `src/db/schema.ts`. Nothing in the screening logic is specific
to depression or any other single condition, because IPMG runs trials
across multiple conditions (MDD, ADHD, anxiety, etc.) and a new trial
should only ever require a new row, never a new code path.

## Screens

- **Patients** — the main workbook: every patient, their overall status,
  and a trial filter.
- **Patient Detail** — per-criterion evidence cards with citations, plus a
  dual-source comparison (IntakeQ vs. Tebra) for identity-critical fields.
- **Identity Matching** — a queue for reconciling referrals that couldn't
  be automatically matched to a Tebra chart.
- **Trials & Protocols** — the criteria configuration for each active trial.
- **Audit Log** — every read/action taken in the system, attributed to a
  user and role.
- **Settings** — connection status and BAA/compliance placeholders.

## Run & operate

```bash
npm install
npm run dev              # http://localhost:3000 — redirects to /login
npm test                 # full Vitest suite (loads .env.local via dotenv-cli)
npm run build            # production build + typecheck
npm run db:generate      # generate a Drizzle migration after a schema change
npm run db:push          # apply schema changes to the linked Neon database
npm run db:seed          # (re)seed the two demo trials and 18 demo patients — destructive, wipes existing rows
```

Required env vars (populated automatically in `.env.local` by
`vercel integration add neon` / `vercel integration add upstash/upstash-kv` —
pull with `vercel env pull .env.local`): `DATABASE_URL` (Neon Postgres),
`KV_REST_API_URL` / `KV_REST_API_TOKEN` (Upstash Redis).

Also required, but *not* provisioned by either Vercel integration —
`IDENTITY_ENCRYPTION_KEY`: a 32-byte base64-encoded key used for AES-256-GCM
encryption of identity-verification ID numbers (see `src/lib/crypto.ts`).
Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Without it, `npm run db:seed` crashes and every identity-verification `PUT`
request 500s.

## Demo auth

There's no real authentication — `/login` lets you pick one of three demo
roles (CRC, PI, Admin) via `/api/demo-login`, which sets a session cookie.
This is explicitly out of scope for this pilot; see the design spec's open
questions for the real-SSO plan (likely SSO against IPMG's identity
provider before any real patient data flows through the system).

## Security model

- `requireSession()` / `requireSessionOrRedirect()` (`src/lib/auth.ts`)
  gate every API route and every dashboard page — there is no page or
  route that renders data before checking for a valid session.
- `src/proxy.ts` (Next.js 16's renamed middleware) validates the session
  **cookie's contents**, not just its presence, and redirects to `/login`
  before a protected page's React tree ever streams — this is the primary
  defense against a PHI leak on an invalid/expired session.
- Server Components call shared query functions in `src/lib/queries/*.ts`
  directly. They **never** `fetch()` the app's own API routes — doing so
  once relied on a client-controlled `Host` header to build the fetch URL,
  which was a real, since-fixed session-cookie-exfiltration vector.
- Every read and write is attributed and logged via `src/lib/audit.ts` —
  audit entries always carry a real, non-null session, never a fallback
  role.
- Request bodies are validated against a strict Zod allowlist (e.g.
  `PUT /api/trials/[trialId]/criteria`) — no mass-assignment from raw JSON.
- The Excel export (`src/lib/excel-export.ts`) sanitizes every cell
  against formula injection (`=`, `+`, `-`, `@` leading characters).

## Stack

Next.js 16 (App Router, TypeScript), Tailwind v4 + shadcn/ui, Drizzle ORM,
Neon Postgres (serverless HTTP driver, `drizzle-orm/neon-http`), Upstash
Redis (read-through cache, `src/lib/cache.ts`), Vitest + Testing Library.

## Design system

The UI is modeled directly on real IntakeQ and Tebra screenshots rather
than generic AI-app styling: a teal/coral palette (`src/app/globals.css`),
zero decorative icons (status is always a colored dot + text label, never
a glyph alone), ALL-CAPS gray section headings, and zebra-striped tables.
See `docs/superpowers/plans/2026-09-17-visual-redesign.md` for the full
before/after rationale.

## Where things live

- `src/db/schema.ts` — source of truth for the DB schema, including the
  per-trial criteria configuration (JSONB, not code)
- `src/lib/rule-engine.ts` — the verdict logic; defaults to yellow, never
  guesses
- `src/lib/queries/*.ts` — shared data-access functions, called directly
  by both API routes and Server Component pages (never `fetch()` the
  app's own API from a Server Component)
- `src/app/(dashboard)/*` — the five main screens (Patients, Identity
  Matching, Trials & Protocols, Audit Log, Settings)
- `src/connectors/*.mock.ts` — mock IntakeQ/Tebra connectors with the same
  function signatures the real, read-only integrations will need later
- `docs/superpowers/specs/` — design specs (product scope, UI/UX)
- `docs/superpowers/plans/` — implementation plans (prototype build,
  visual redesign)

## Deployment

The project is linked to Vercel (`vercel link`). To deploy:

```bash
vercel                # preview deployment
vercel --prod         # production deployment
```

Environment variables (`DATABASE_URL`, `KV_REST_API_URL`,
`KV_REST_API_TOKEN`) are provisioned automatically via the Neon and
Upstash Vercel Marketplace integrations attached to this project.
