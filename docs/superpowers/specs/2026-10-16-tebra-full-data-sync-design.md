# Tebra Full Data Sync: Appointments, Encounters, Billing, Payments, Documents

**Status:** design drafted, pending review before an implementation plan is written.
**Project 1 of 4** from this session's queue. The other three — Better Auth migration,
`symbiosys-labs/clinsync` CI/CD + self-hosted deployment, and the full UI redesign — are each
their own design → spec → plan cycle, done one at a time after this one.

## 0. Decisions already made (confirmed in conversation before this doc)

- **Direction: Tebra → Clinsync only.** Tebra remains the practice's primary day-to-day system.
  Clinsync never writes back to Tebra. Two-way sync is explicitly deferred to a future project.
- **Clinsync becomes its own system of record for anything created in it.** Staff can create
  appointments, encounters, charges, and documents directly in Clinsync; those rows never touch
  Tebra and never get overwritten by the sync.
- **Recurring incremental pull, not a one-time backfill.** Tebra documents 5–10 minute polling as
  its own recommendation (confirmed directly against `helpme.tebra.com`'s API/Integration page),
  using `FromLastModifiedDate`/`ToLastModifiedDate` filters it supports on every entity type that
  matters here. The very first run (no cursor yet) *is* the historical backfill — no separate
  one-off script.
- **Documents:** real file storage gets built regardless of the backfill question. Tebra's API
  can create/delete documents but has no operation to read existing ones back out (confirmed
  against the live WSDL — `CreateDocument`/`DeleteDocument` exist, no `GetDocuments`). Historical
  documents come in two ways, not one: a bulk import if the practice can export them from Tebra,
  and an ad-hoc "upload it when someone actually needs it" path otherwise. Both land in the same
  storage.
- **Role-based surfacing:** patients see their own appointments, their own billing balance, and
  documents about them — "same as they'd see in person." Staff role split follows the pattern
  already established in `role-capabilities.ts` (see §5).
- **HIPAA is a baseline, not a bolt-on,** applied the same way the rest of Clinsync already does
  it (see §6) — this spec doesn't re-derive it field by field.
- **Existing mock/seed data is untouched until real Tebra access is confirmed working.** This
  rollout is purely additive: new nullable columns with safe defaults, new tables alongside
  existing ones, nothing deleted or overwritten. The demo keeps working exactly as it does today
  throughout this entire build. Retiring seed data in favor of real synced data is a separate,
  explicit decision made later, once a practice's first real sync run is verified correct — not an
  automatic side effect of shipping this.

## 1. What this closes

Clinsync's connector (`src/connectors/tebra.client.ts`) only pulls 4 demographic fields
(name/DOB/city/zip/email) via `GetPatients`/`GetPractices`/`CreatePatient`. Everything else —
appointments, encounters with diagnoses/procedures, charges, payments, insurance, documents — is
either not pulled at all or lives only as seed/mock data with no real connection to the practice's
actual Tebra account. Confirmed directly against the live WSDL (`KareoServices.svc?wsdl`) and its
data-contract schema: all of this data genuinely exists and is pullable (patients alone expose
~190 fields including full primary/secondary/tertiary insurance, SSN, guarantor, and billing
balances); only pre-existing scanned documents are permanently out of API reach.

## 2. A wrinkle the original framing missed: most of the tables already exist

`charges`, `insuranceClaims`, `providers`, `appointments`, and `documents` are real tables today
(`src/db/schema.ts`), driving real UI, populated by seed data. This spec **extends** them rather
than inventing parallel ones — the "unified table, source-tagged" approach applies directly, it
just means adding columns to existing tables in most cases rather than creating new ones.

One genuine naming collision: `mockPayments` (`src/db/schema.ts:240`) is the existing *simulated
virtual-card-payment* demo feature (`src/app/api/mock-payments/route.ts`) — a patient "pays" with
a fake card number and Clinsync runs a fake Luhn check. That's an unrelated concept from Tebra's
real payment/remittance history (`GetPayments`: payer, amount, method, applied/unapplied/refunds).
The new table for Tebra's real payments is called `payments`, kept entirely separate from
`mockPayments`, which is untouched by this project.

## 3. Data model changes

Every migration below is additive only (new nullable columns, new tables) — no existing row is
modified or deleted. Existing seeded/demo rows in `appointments`, `charges`, `providers`,
`insuranceClaims`, and `documents` backfill `source: 'clinsync'` on the new column (accurate: they
were inserted by Clinsync's own seed script, not pulled from Tebra) and `tebraId: null`, so every
existing query, page, and test keeps working unchanged. Per §0, nothing here deletes or replaces
that data — this is additive until a real sync run is verified correct.

**Extended (add `source: 'tebra' | 'clinsync'` + nullable `tebraId: text` to each):**
- `appointments` — Tebra's `AppointmentData` maps cleanly onto the existing shape
  (`startsAt`/`endsAt`/`visitReason`/`status`); `providerId` resolves through the extended
  `providers` table below.
- `providers` — synced from `GetProviders`, once daily (reference data, barely changes).
- `charges` — Tebra's `ChargeData` is far richer than the current shape, but the current
  `diagnosisCodes`/`procedureCodes` jsonb columns already hold exactly the granularity needed;
  richer per-payer claim detail (primary/secondary/tertiary allowed/paid/adjusted amounts, claim
  status) maps onto `insuranceClaims`, one row per payer per charge — which already models that
  relationship (`insuranceClaims.chargeId -> charges.id`).
- `insuranceClaims` — same extension, populated from the same `ChargeData` pull.
- `documents` — extended with `source`/`tebraId` **and** real storage: `blobKey: text`,
  `fileSizeBytes: integer`, `uploadedBy: text` (nullable — null for a Tebra-sourced row with no
  file yet, non-null once a file exists via either import path), `patientVisible: boolean`
  (default `false`) — the field §5's Patient Portal surfacing actually checks; an internal staff
  note stays staff-only by default, and someone explicitly marks a document patient-visible (an
  after-visit summary, a signed consent copy) rather than every document defaulting to exposed.
  The existing comment ("no file is ever stored") stops being true for `source: 'clinsync'` rows
  and `source: 'tebra'` rows that went through the bulk-import or ad-hoc-upload path.

**New tables:**
- `encounters` — `tebraId`, `patientId`, `providerId`, `serviceLocationId`, `serviceStartDate`,
  `serviceEndDate`, `status` (`EncounterDetailsData.EncounterStatus`'s own values). `charges` gets
  a new nullable `encounterId` FK — Tebra's `ChargeData.EncounterID` is the natural join key, and
  this makes "all charges for this visit" a real grouping instead of flat, ungrouped line items.
- `payments` — the real Tebra payment history (see §2's naming note): `tebraId`, `patientId`,
  `chargeId` (nullable), `payerName`, `payerType`, `amountCents`, `method`, `postedDate`.
- `serviceLocations`, `procedureCodes` — reference data, daily sync, same shape as `providers`.
- `syncCursors`: `entityType` (enum: patient/appointment/charge/payment/provider/serviceLocation/
  procedureCode), `practiceId`, `lastSyncedAt`, `status` (`idle`/`running`/`failed`). One row per
  entity type per practice; this is what makes the recurring job incremental instead of a full
  re-pull every 10 minutes.
- `syncRuns`: append-only log — `entityType`, `startedAt`, `finishedAt`, `recordsProcessed`,
  `outcome` (`ok`/`partial`/`failed`), `errorKind` (reusing `EhrErrorKind` from
  `connectors/errors.ts` — no new error taxonomy). This is the only thing that makes sync health
  observable instead of a black box; Settings → EHR Connections is the natural place to surface
  "last synced 4 minutes ago" per entity type.

## 4. Sync engine

**Connector additions** (`tebra.client.ts`): `getAppointments(filter)`, `getCharges(filter)`,
`getPayments(filter)`, `getProviders()`, `getServiceLocations()`, `getProcedureCodes()`,
`getEncounterDetails(encounterId)` — same `call()` plumbing, pacing, and retry logic the existing
`getPatients`/`getPractices` already use; no new transport code.

**Scheduled job** (Vercel Cron, every 10 minutes — matching Tebra's own documented
recommendation): for each practice with configured credentials, for patients → appointments →
charges → payments, in that order: pull with `FromLastModifiedDate` = that entity's cursor, upsert
tagged `source: 'tebra'`, advance the cursor to the max `LastModifiedDate` seen. The charges step
also upserts `insuranceClaims` rows from the same `ChargeData` payload (§3) — it isn't a separate
cursored pull, it rides along with charges since the data arrives together. Collect every new
`EncounterID` seen in this run's charges; for each one not already in `encounters`, call
`GetEncounterDetails` (one call per encounter, paced at Tebra's ~1/sec limit — this is the one
genuinely slow part of a large first backfill, flagged honestly below). Neither `insuranceClaims`
nor `encounters` gets its own row in `syncCursors` for the same reason: Tebra's `EncounterDetailsFilter`
only accepts an `EncounterID`, not a date range, so there's nothing to track a cursor against —
encounters are discovered, not polled. Reference data (`providers`/`serviceLocations`/
`procedureCodes`) syncs once daily, separately.

**Native creates** never touch this job: `POST /api/appointments`, `/api/charges`, `/api/encounters`,
and the document upload route insert directly with `source: 'clinsync'`, `tebraId: null`, following
the exact validate → insert → invalidate-cache → audit-log shape every other Clinsync write route
already uses.

## 5. Role-based access

Extends the existing `role-capabilities.ts` pattern — no new permission model, new predicates in
the same file:

- **CRC / Admin (operations roles):** everything — appointments, encounters, charges, payments,
  documents, same as every other operations-gated feature in Clinsync today.
- **PI:** clinical only. Per the PI's own documented capability summary
  (`role-capabilities.ts:22-32`), billing/payments are explicitly "the coordinator's and admin's
  tools, not shown here" — a PI sees encounters and their diagnoses (clinically relevant), not
  charges, claims, or payments. New predicate: `canViewBilling(role)`, same shape as
  `canAccessOperations`.
- **Patient Portal:** own appointments (upcoming + past), own billing — balance/statement level,
  never per-payer claim adjudication detail a patient wouldn't see in person — and documents
  flagged patient-visible (an after-visit summary, not an internal staff note). New routes mirror
  the existing `patient-portal/*` pattern exactly (own-record-only enforcement, same session
  check, same audit logging via `logPatientPortalAction`).

## 6. HIPAA baseline

No new mechanism — applying what Clinsync already has, to the new fields:
- **Encryption at rest:** SSN and insurance ID/policy numbers pulled from Tebra go through the
  existing `encryptSensitive`/`IDENTITY_ENCRYPTION_KEY` helper (`lib/crypto.ts`), the same one
  already protecting identity-verification ID numbers — no new crypto.
- **Audit logging:** every read and write of this new data goes through the existing
  `logAudit`/`logPatientPortalAction` calls, same as every existing route.
- **RBAC:** enforced server-side first (§5), UI hides controls as a courtesy only — the existing
  house rule everywhere else in this codebase.
- **No PHI in errors:** the sync job and new routes reuse `EhrConnectorError`'s fixed,
  credential-and-vendor-message-free error messages (`connectors/errors.ts`) — a Tebra error
  response is inspected for classification only, never echoed to a log or a user.
- **File storage:** Vercel Blob, private mode, expiring signed URLs for every download — no
  permanently-public document URL, ever.

## 7. Error handling

- One entity type failing mid-run doesn't advance that type's cursor and doesn't block the other
  types in the same run; it retries the same window on the next tick.
- Whole-account failure (the `auth_failed`/`vendor_error` situations already hit directly this
  session) logs clearly to `syncRuns` and backs off to the next scheduled tick — the existing
  connector's retry/pacing already covers transient failures; no new backoff logic needed.
- Document upload: Blob upload happens before the DB insert; if the insert fails after a
  successful upload, the orphaned Blob object is deleted rather than left dangling.

## 8. Testing

- Connector: mock Tebra XML responses per new operation (same pattern the existing client/tests
  already use), verifying field mapping into each table.
- Sync worker: inject a fake `TebraConnector` (the interface already exists for exactly this) and
  a fake clock; verify cursor advancement, per-entity-type failure isolation, and
  encounter-discovery-then-fetch.
- Role gates: PI cannot reach `/api/charges`, `/api/payments`, or billing data anywhere (extends
  the existing `route-gates.test.ts` harness — every new route gets a row); patient-portal routes
  only ever return the authenticated patient's own rows, verified the same way
  `patient-portal-medications-export` etc. already are.
- Real end-to-end verification against live Tebra data is blocked on the account-access issue
  still being chased down (§9) — everything above can be built and fully unit-tested now; the
  first real sync run needs working credentials.

## 9. Open dependencies / honest caveats

- **Blocked on Tebra account access.** The credentials tested so far (both practices) hit a
  server-side crash in Tebra's own `GetFilteredPractices` before authentication even completes —
  not a Clinsync-side issue. Waiting on credentials from whoever actually created the customer key.
- **First backfill timing.** A practice with thousands of historical encounters means thousands
  of individual `GetEncounterDetails` calls at ~1/second — the first run could take well over an
  hour. Fine for a background job; worth setting expectations on, not worth engineering around for
  a one-time cost.
- **Document bulk-import path (§0) depends on the practice actually producing an export** — not
  something this project can force; the ad-hoc upload path exists specifically so nothing is
  permanently blocked if they can't.

## Out of scope (explicitly, for this spec)

- Write-back to Tebra (two-way sync) — deferred, per §0.
- Better Auth migration, the `symbiosys-labs/clinsync` CI/CD pipeline, and the UI redesign — each
  their own project, queued after this one.
