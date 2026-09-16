# Clinsync — IPMG Research Pre-Screening Workbook (Pilot Demo)

**⚠️ PILOT / DEMO — no real patient data.** This is a clickable prototype for
a client engagement (Symbiosys Technologies → Inland Psychiatric Medical
Group), built to demonstrate the product before real IntakeQ/Tebra API
credentials exist. All patient data is fictional, seeded from
`src/db/seed.ts`. Every screen carries a persistent "PILOT / DEMO" banner so
it can never be mistaken for production.

It combines referral data from **IntakeQ** and clinical chart data from
**Tebra** (both mocked here — see `src/connectors/*.mock.ts`) into a single
review workbook for research coordinators, with a trial-criteria screening
engine that marks each criterion 🟢 Meets / 🟡 Needs Verification / 🔴
Potential Exclusion, always with the exact chart quote as evidence.

See the design spec and implementation plan for the full requirements and
architecture:
- `docs/superpowers/specs/2026-09-16-ipmg-workbook-ui-ux-design.md`
- `docs/superpowers/plans/2026-09-16-ipmg-workbook-prototype.md`

## Run & Operate

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
see `vercel env pull .env.local`): `DATABASE_URL` (Neon Postgres),
`KV_REST_API_URL` / `KV_REST_API_TOKEN` (Upstash Redis).

## Demo auth

There's no real authentication — `/login` lets you pick one of three demo
roles (CRC, PI, Admin) via `/api/demo-login`, which sets a cookie. This is
explicitly out of scope for real deployment; see the design spec's open
questions for the real-SSO plan.

## Stack

Next.js 16 (App Router, TypeScript), Tailwind v4 + shadcn/ui, Drizzle ORM,
Neon Postgres (serverless HTTP driver, `drizzle-orm/neon-http`), Upstash
Redis (read-through cache, `src/lib/cache.ts`), Vitest.

## Where things live

- `src/db/schema.ts` — source of truth for the DB schema
- `src/lib/queries/*.ts` — shared data-access functions, called directly by
  both API routes and Server Component pages (never `fetch()` the app's own
  API from a Server Component — see the comment in `queries/patients.ts`)
- `src/app/(dashboard)/*` — the five main screens (Patients, Identity
  Matching, Trials & Protocols, Audit Log, Settings)
- `src/connectors/*.mock.ts` — mock IntakeQ/Tebra connectors with the same
  function signatures the real ones will need later (Plan B)
