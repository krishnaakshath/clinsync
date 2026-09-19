# Clinsync — IPMG Research Pre-Screening Workbook

**Live:** [clinsync-phi.vercel.app](https://clinsync-phi.vercel.app)

A pilot build for a client engagement (Symbiosys Technologies → Inland
Psychiatric Medical Group), demonstrating the product ahead of real
IntakeQ/Tebra API credentials. All patient data is fictional, seeded from
`src/db/seed.ts` — no real patient data is used anywhere in this build.

## What it does

Clinsync reconciles referral data from **IntakeQ** and clinical chart data
from **Tebra** (both read-only, both mocked here — see
`src/connectors/*.mock.ts`) into a single review workbook for research
coordinators and investigators. A rule engine screens each patient against
a trial's criteria and marks every criterion:

- **Meets** — chart evidence clearly satisfies the criterion
- **Needs Verification** — evidence is missing, ambiguous, or the two
  source systems disagree
- **Potential Exclusion** — chart evidence clearly disqualifies

Every verdict is backed by the exact chart quote it was derived from —
never a summary, never a guess. **The rule engine never invents a "meets"
or "excludes" verdict from absent evidence: an empty evidence set always
defaults to "needs verification"** (`src/lib/eligibility.ts`,
`src/lib/rule-engine.ts`). Humans — coordinators first, then the
investigator — always make the actual eligibility call; the app only ever
proposes.

Trial criteria (diagnosis codes, rating-scale thresholds, medication
stability/washout rules, age range, exclusion diagnoses) are **data on the
`trials` table, not code** — see the JSONB columns in `src/db/schema.ts`.
Nothing in the screening logic is specific to depression or any other
single condition, since IPMG runs trials across multiple conditions (MDD,
ADHD, and others) and a new trial should only ever require a new row,
never a new code path.

## Roles and sign-in

Staff (admin, principal investigator, coordinator) share one login flow at
`/login` and one session cookie — only one staff identity can be active per
browser at a time. Patients sign in separately at `/patient-portal/login`
with a patient ID and a portal password issued by staff; that session uses
a completely distinct cookie and can never be reinterpreted as a staff
session (see `src/lib/auth.ts` vs. `src/lib/patient-session.ts`).

Every write is role-checked server-side, not just hidden in the UI — e.g.
practice settings, EHR connection fields, and provider-profile edits are
admin-only regardless of what a client sends.

## Screens

**Workspace**
- **Home** — real-time stats (peak scheduling hours, total patients
  screened/unscreened, average patient-experience rating), a
  patients-by-month chart, a screening-status breakdown, and the day's
  appointments.
- **My Patients** — an investigator's own assigned-patient view.
- **Patients** — the main workbook: every patient, their overall status,
  inclusion/exclusion criteria met, and a trial filter.
- **Patient Detail** — screening evidence per criterion, identity
  verification status, form-vs-chart discrepancies, and patient portal
  access management; a dedicated **Medical Record** page holds the
  dual-sourced demographic fields, diagnoses, medications, and allergies.
- **Workbook** — the exportable Excel pre-screening workbook.
- **Identity Matching** — a queue for reconciling referrals that couldn't
  be automatically matched to a chart.
- **Trials & Protocols** — each trial's inclusion/exclusion configuration,
  plus a live breakdown of every patient screened against it (passed,
  needs verification, or rejected, with the specific evidence why).
- **Calendar** — the day's appointments per provider.
- **Form Templates** — a question editor for intake forms, including
  answer options for choice-type questions.
- **Client Forms** — every intake form sent to a patient, its completion
  status, and a readable view of the submitted answers.
- **Messages** — a per-patient thread for staff to message a patient
  directly; mirrored in the patient's own portal.

**Billing** — charges, insurance collections, patient collections,
statements, an A/R dashboard, analytics, and a simulated virtual-card
payment demo (no real payment processing).

**Operations** — cross-cutting reports (patients, appointments,
encounters, insurance collections, unsigned notes), document/fax intake
with processing status, patient broadcasts (simulated SMS/email, never
sent to a real patient), post-screening experience surveys, a pipeline
performance dashboard, and Settings (practice info, EHR connection
placeholders, auto-classification toggle, provider roster, and a
role-capability summary on each user's own account).

**Patient Portal** (`/patient-portal`) — a separate, patient-facing
surface with its own sidebar: overview, forms to complete, medications,
appointments, and messages with the care team.

## Run & operate

```bash
npm install
npm run dev              # http://localhost:3000 — redirects to /login
npm test                 # full Vitest suite (loads .env.local via dotenv-cli)
npm run build            # production build + typecheck
npm run db:seed          # seed the demo trials/patients — safe to re-run, tops up rather than wipes if already seeded
```

### Database changes — read before touching the schema

This project's Neon Postgres database is shared across every branch and
worktree. **Never run `npm run db:generate` or `npm run db:push` against
it.** `drizzle-kit push` diffs your *entire local* `schema.ts` against the
*entire live database* and will drop any table your current branch's
schema.ts doesn't happen to declare — including tables other in-progress
work already created. Make schema changes by hand instead: add the column
or table to `src/db/schema.ts` (a pure TypeScript change, always safe),
then apply the matching `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ...
ADD COLUMN IF NOT EXISTS` via a one-off script run through `tsx` and
deleted afterward. `npm run db:seed` itself is safe to re-run — it detects
an already-populated database and tops up any of its own tables that are
still empty instead of wiping anything.

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

Also required for staff login — `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`,
`ADMIN_NAME`: the always-available admin account (additional
coordinator/investigator accounts live in the `users` table, seeded with
their own password hashes). `ADMIN_PASSWORD_HASH` is a `salt:hash` pair
produced by `src/lib/password.ts`'s `hashPassword()` (scrypt, not a
plaintext or reversible value). Generate one with:

```bash
node -e "const{randomBytes,scryptSync}=require('crypto');const s=randomBytes(16).toString('hex');console.log(s+':'+scryptSync(process.argv[1],s,64,{N:131072,r:8,p:1,maxmem:256*1024*1024}).toString('hex'))" "your-new-password"
```

Also required for the patient portal in production — the fixed
demo-only patient portal password (`Pressword@69420`, see
`src/app/api/patients/[anonId]/portal-password/route.ts`) is hard-gated to
`NODE_ENV !== 'production'`; a real production deploy always falls back to
per-patient random password generation instead.

## Security model

- `requireSession()` / `requireSessionOrRedirect()` (`src/lib/auth.ts`)
  gate every staff API route and dashboard page; `requirePatientSession()`
  / `requirePatientSessionOrRedirect()` (`src/lib/patient-session.ts`) do
  the same for the patient portal, on a separate cookie and a JWT that
  carries a `kind: 'patient'` claim so it can never be reinterpreted as a
  staff session even though both share the same signing secret.
- `src/proxy.ts` validates the session **cookie's contents**, not just its
  presence, and redirects before a protected page's React tree ever
  streams — the primary defense against a PHI leak on an invalid/expired
  session.
- Server Components call shared query functions in `src/lib/queries/*.ts`
  directly. They **never** `fetch()` the app's own API routes — doing so
  once relied on a client-controlled `Host` header to build the fetch URL,
  a real, since-fixed session-cookie-exfiltration vector.
- Every read and write is attributed and logged via `src/lib/audit.ts`
  (staff) or `src/lib/patient-portal-audit.ts` (patients) — audit entries
  always carry a real, non-null session, never a fallback role.
- Request bodies are validated against a strict Zod allowlist on every
  write route — no mass-assignment from raw JSON.
- Login is rate-limited per IP and, for the patient portal, also on an
  IP-independent global bucket keyed on patient ID (`src/lib/rate-limit.ts`).
- The Excel export (`src/lib/excel-export.ts`) sanitizes every cell
  against formula injection (`=`, `+`, `-`, `@` leading characters).

## Stack

Next.js 16 (App Router, TypeScript), Tailwind v4 (oklch design tokens,
`src/app/globals.css`), Drizzle ORM, Neon Postgres (serverless HTTP
driver, `drizzle-orm/neon-http`), Upstash Redis (read-through cache,
`src/lib/cache.ts`), recharts, Vitest + Testing Library.

## Where things live

- `src/db/schema.ts` — source of truth for the DB schema, including the
  per-trial criteria configuration (JSONB, not code)
- `src/lib/eligibility.ts` / `src/lib/rule-engine.ts` — the verdict logic;
  defaults to "needs verification", never guesses
- `src/lib/queries/*.ts` — shared data-access functions, called directly
  by both API routes and Server Component pages
- `src/app/(dashboard)/*` — the staff-facing screens
- `src/app/patient-portal/*` — the patient-facing portal (login outside
  the `(authenticated)` route group, the portal itself inside it)
- `src/connectors/*.mock.ts` — mock IntakeQ/Tebra connectors with the same
  function signatures the real, read-only integrations will need later
- `public/branding/` — IPMG's logo assets, used throughout the UI
  alongside the Clinsync product name
- `docs/superpowers/specs/` — design specs (product scope, UI/UX)
- `docs/superpowers/plans/` — implementation plans

## Deployment

The project is linked to Vercel (`vercel link`). To deploy:

```bash
vercel                # preview deployment
vercel --prod         # production deployment
```

Environment variables (`DATABASE_URL`, `KV_REST_API_URL`,
`KV_REST_API_TOKEN`) are provisioned automatically via the Neon and
Upstash Vercel Marketplace integrations attached to this project;
`ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` / `ADMIN_NAME` /
`IDENTITY_ENCRYPTION_KEY` / `SESSION_SECRET` are set manually via
`vercel env add`.
