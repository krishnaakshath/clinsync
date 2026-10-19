# Tebra Sync Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get real Tebra data (appointments, charges + insurance claims, encounters, payments, reference data) flowing into Clinsync's own tables on a recurring incremental sync, without disturbing any existing seed/demo data.

**Architecture:** Extend the existing `appointments`/`charges`/`providers`/`insuranceClaims` tables with a `source`/`tebraId` discriminator; add `encounters`, `payments`, `serviceLocations`, `procedureCodes`, `syncCursors`, `syncRuns` tables. A Vercel Cron job pulls each entity type incrementally via Tebra's `FromLastModifiedDate` filters, upserts tagged `source: 'tebra'`, and advances a per-entity cursor. Native Clinsync creates (already-existing `POST /api/appointments`/`/api/charges`) get tagged `source: 'clinsync'` and never touch the sync.

**Tech Stack:** Next.js API routes, Drizzle ORM (Postgres), the existing SOAP Tebra connector (`src/connectors/tebra.client.ts`), Vercel Cron, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-16-tebra-full-data-sync-design.md` — this plan implements that spec's §3 (data model), §4 (sync engine), and the native-create part of §5. Role-based *surfacing* (patient portal billing/documents pages, document storage) is **Plan 2 of 2** — a separate plan, written once this one is reviewed, since it depends on this pipeline existing but is otherwise independently buildable and testable.

## Global Constraints

- Every schema change is additive only — new nullable columns, new tables. No existing row is
  modified or deleted (spec §0, §3).
- Existing seeded rows backfill `source: 'clinsync'`, `tebraId: null` on migration.
- No write-back to Tebra, ever, in this plan (spec §0).
- Tebra's documented pacing is ~1 request/second; the existing connector's `spaceCalls()`/retry
  logic already enforces this — new methods must reuse it, not bypass it.
- `EncounterDetailsFilter` only accepts `EncounterID`/`Practice` — no date-range filter exists for
  it. Encounters are discovered via charges, never independently cursored (spec §4).
- `mockPayments` (`src/db/schema.ts:240`) is an unrelated existing demo feature — the new
  Tebra-payments table is named `payments`, never confused with it (spec §2).
- No PHI, vendor message, or credential ever reaches a log, error response, or `syncRuns` row —
  only `EhrErrorKind` values (`src/connectors/errors.ts`), same as everywhere else in this codebase.

## Review Focus

- **A practice with zero historical encounters** — the sync must complete a run with an empty
  `encounters` upsert step, not throw on an empty ID set.
- **A charge whose `EncounterID` was already seen in a previous run** — must not re-fetch
  `GetEncounterDetails` for it (wasted quota) or create a duplicate `encounters` row.
- **Tebra returning zero records for an entity type in a given window** — a legitimately empty
  incremental pull must still advance that entity's cursor to "now," not leave it stuck re-pulling
  an empty window forever.
- **Two cron invocations overlapping** (a slow run still going when the next 10-minute tick
  fires) — must not double-process or corrupt a cursor; the `syncCursors.status` field exists
  specifically so a `running` cursor is skipped by a concurrent invocation, not raced.
- **A native `POST /api/appointments`/`/api/charges` call racing the sync job** — a Clinsync-native
  row must never be overwritten by an incoming Tebra upsert; upserts match on `tebraId`, which a
  Clinsync-native row never has, so this can't actually collide by construction, but the task
  implementing the upsert must assert that explicitly (not rely on it being accidentally true).

---

### Task 1: Schema migration — extend existing tables, add new ones

**Files:**
- Modify: `src/db/schema.ts`
- Create (generated): `drizzle/00XX_*.sql` via `npm run db:generate`
- Test: `tests/db/tebra-sync-schema.test.ts`

**Interfaces:**
- Produces: `sourceEnum = pgEnum('source', ['tebra', 'clinsync'])`; `appointments.source`,
  `appointments.tebraId` (nullable text); same pair on `charges`, `providers`, `insuranceClaims`,
  `documents`; `charges.encounterId` (nullable, references `encounters.id`); `documents.blobKey`
  (nullable text), `documents.fileSizeBytes` (nullable integer), `documents.uploadedBy` (nullable
  text), `documents.patientVisible` (boolean, default `false`); new tables `encounters`,
  `payments`, `serviceLocations`, `procedureCodes`, `syncCursors`, `syncRuns` (exact columns per
  spec §3).
- `syncCursorEntityEnum = pgEnum('sync_cursor_entity', ['patient', 'appointment', 'charge',
  'payment', 'provider', 'serviceLocation', 'procedureCode'])` — matches spec §3's list exactly
  (no `encounter`/`insuranceClaims` entry — spec §4 explains why).
- `syncStatusEnum = pgEnum('sync_status', ['idle', 'running', 'failed'])`.
- `syncOutcomeEnum = pgEnum('sync_outcome', ['ok', 'partial', 'failed'])`.

- [ ] **Step 1: Write the failing test** — `tests/db/tebra-sync-schema.test.ts` asserts: (a) an
  existing seeded `appointments` row (from `npm run db:seed`) has `source === 'clinsync'` and
  `tebraId === null` after migration; (b) inserting a row into each new table (`encounters`,
  `payments`, `serviceLocations`, `procedureCodes`, `syncCursors`, `syncRuns`) with only required
  fields succeeds and round-trips.

- [ ] **Step 2: Run test to verify it fails** — `npx dotenv -e .env.local -- vitest run tests/db/tebra-sync-schema.test.ts` — expected: FAIL (tables/columns don't exist yet).

- [ ] **Step 3: Add the schema** to `src/db/schema.ts` — new enums and table definitions as listed
  above; `source` columns default `'clinsync'` (so backfill of existing rows needs no explicit
  `UPDATE`) and `notNull()`; `tebraId` nullable with a unique index per table (`(tebraId)` where
  not null — prevents two sync runs from ever double-inserting the same Tebra record).

- [ ] **Step 4: Generate and apply the migration** — `npm run db:generate`, review the generated
  SQL, `npm run db:push`.

- [ ] **Step 5: Run test to verify it passes** — same command as Step 2 — expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts drizzle/ tests/db/tebra-sync-schema.test.ts
git commit -m "schema: add Tebra sync tables and source-tagging columns"
```

---

### Task 2: Connector interface + mock implementation

**Files:**
- Modify: `src/connectors/types.ts`
- Modify: `src/connectors/tebra.mock.ts`
- Test: `tests/connectors/tebra.mock.test.ts`

**Interfaces:**
- Consumes: nothing new (existing `TebraConnector` interface).
- Produces: `TebraConnector` gains `getAppointments(filter: {fromLastModifiedDate?: string}):
  Promise<TebraAppointment[]>`, `getCharges(filter): Promise<TebraCharge[]>`,
  `getPayments(filter): Promise<TebraPayment[]>`, `getProviders(): Promise<TebraProvider[]>`,
  `getServiceLocations(): Promise<TebraServiceLocation[]>`,
  `getProcedureCodes(): Promise<TebraProcedureCode[]>`,
  `getEncounterDetails(encounterId: string): Promise<TebraEncounterDetail | null>`. New exported
  types `TebraAppointment`, `TebraCharge` (includes `encounterId`, `primaryInsurance`/
  `secondaryInsurance`/`tertiaryInsurance` sub-objects per spec §3), `TebraPayment`,
  `TebraProvider`, `TebraServiceLocation`, `TebraProcedureCode`, `TebraEncounterDetail` in
  `src/connectors/types.ts`, mirroring the field names in the spec's §3 table-column lists (not
  Tebra's raw XML field names — the connector maps those into these shapes).

- [ ] **Step 1: Write the failing test** — `tests/connectors/tebra.mock.test.ts`: for each of the
  7 new methods, call it on `createTebraMockClient()` and assert it resolves to a non-empty array
  (or non-null object for `getEncounterDetails`) with the expected shape's keys present.

- [ ] **Step 2: Run test to verify it fails** — expected: FAIL (methods don't exist).

- [ ] **Step 3: Add the 7 method signatures to the `TebraConnector` interface** in `types.ts`, and
  implement each in `tebra.mock.ts` returning 2-3 realistic fake records each (same style as the
  existing mock's fake patients) — this keeps Clinsync's demo mode (no real Tebra account
  configured) working end-to-end through every new code path built in later tasks.

- [ ] **Step 4: Run test to verify it passes** — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/types.ts src/connectors/tebra.mock.ts tests/connectors/tebra.mock.test.ts
git commit -m "connectors: extend TebraConnector interface with appointments/charges/payments/encounters"
```

---

### Task 3: Real Tebra client — new SOAP operations

**Files:**
- Modify: `src/connectors/tebra.client.ts`
- Test: `tests/connectors/tebra.client.test.ts` (extend existing file if present, else create)

**Interfaces:**
- Consumes: `TebraConnector`'s new method signatures from Task 2; the existing private `call()`,
  `el()`, `members()`, `fieldsXml()` helpers already in this file.
- Produces: real implementations of all 7 methods, each calling the matching live SOAP operation
  (`GetAppointments`, `GetCharges`, `GetPayments`, `GetProviders`, `GetServiceLocations`,
  `GetProcedureCodes`, `GetEncounterDetails`) confirmed to exist against the live WSDL. Field
  lists per operation: `AppointmentFieldsToReturn`/`ChargeFieldsToReturn`/etc. — request only the
  fields each mapped type in Task 2 actually uses, same minimal-fields discipline
  `PATIENT_FIELDS`/`PRACTICE_FIELDS` already follow.

- [ ] **Step 1: Write the failing test** — for each new method, a test that mocks `fetch` to
  return a fixture SOAP XML response (one fixture per operation, built from the real field names
  confirmed against the live schema) and asserts the method maps it into the exact shape Task 2
  defined — e.g. `test('getCharges maps EncounterID and primary insurance fields', ...)`.

- [ ] **Step 2: Run test to verify it fails** — expected: FAIL.

- [ ] **Step 3: Implement each method** — same `call(operation, fieldsXml(...) + filterXml)`
  pattern as `getPatients`/`getPractices`; filters use the `From`/`ToLastModifiedDate` members
  (ordinal-sorted, matching the existing `members()` helper's alphabetical-ordering requirement)
  for every method except `getEncounterDetails`, which takes `encounterId` directly (no filter —
  `EncounterDetailsFilter` only accepts `EncounterID`/`Practice`, per the Global Constraints).

- [ ] **Step 4: Run test to verify it passes** — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/tebra.client.ts tests/connectors/tebra.client.test.ts
git commit -m "connectors: implement GetAppointments/GetCharges/GetPayments/GetProviders/GetServiceLocations/GetProcedureCodes/GetEncounterDetails"
```

---

### Task 4: Sync bookkeeping — cursors and run log

**Files:**
- Create: `src/lib/queries/sync-cursors.ts`
- Create: `src/lib/queries/sync-runs.ts`
- Test: `tests/lib/queries/sync-cursors.test.ts`, `tests/lib/queries/sync-runs.test.ts`

**Interfaces:**
- Consumes: `syncCursors`/`syncRuns` tables from Task 1.
- Produces: `getCursor(entityType: SyncCursorEntity, practiceId: string): Promise<Date | null>`
  (null = never synced), `claimCursor(entityType, practiceId): Promise<boolean>` (atomically sets
  `status: 'running'` iff currently `idle`/`failed`, returns whether the claim succeeded — this is
  what makes overlapping cron ticks safe, per Review Focus), `releaseCursor(entityType,
  practiceId, lastSyncedAt: Date, outcome: 'idle' | 'failed'): Promise<void>`. And
  `recordSyncRun(entityType, startedAt: Date, finishedAt: Date, recordsProcessed: number, outcome:
  'ok' | 'partial' | 'failed', errorKind?: EhrErrorKind): Promise<void>`.

- [ ] **Step 1: Write the failing tests** — `claimCursor` returns `true` on first call for a given
  entity/practice, `false` on a second concurrent call before `releaseCursor` runs (Review Focus:
  overlapping cron ticks); `getCursor` returns `null` before any `releaseCursor`, then the passed
  `lastSyncedAt` after; `recordSyncRun` inserts a row readable back with all fields intact.

- [ ] **Step 2: Run tests to verify they fail** — expected: FAIL.

- [ ] **Step 3: Implement** — `claimCursor` as a single `UPDATE ... WHERE status != 'running'
  RETURNING id` (the row-count of the return is the atomic claim check — no separate SELECT then
  UPDATE, which would race); `getCursor`/`releaseCursor`/`recordSyncRun` as straightforward
  `select`/`update`/`insert`.

- [ ] **Step 4: Run tests to verify they pass** — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/sync-cursors.ts src/lib/queries/sync-runs.ts tests/lib/queries/sync-cursors.test.ts tests/lib/queries/sync-runs.test.ts
git commit -m "sync: add cursor claim/release and run-log query modules"
```

---

### Task 5: Upsert-from-Tebra — appointments, providers, charges + insurance claims

**Files:**
- Modify: `src/lib/queries/appointments.ts`
- Modify: `src/lib/queries/providers.ts`
- Modify: `src/lib/queries/charges.ts`
- Test: extend `tests/lib/queries/appointments.test.ts`, `tests/lib/queries/providers.test.ts`,
  `tests/lib/queries/charges.test.ts`

**Interfaces:**
- Consumes: `TebraAppointment`/`TebraProvider`/`TebraCharge` from Task 2.
- Produces: `upsertAppointmentFromTebra(data: TebraAppointment): Promise<void>` (matches on
  `tebraId`; insert if absent, update if present — never touches a `source: 'clinsync'` row,
  per Global Constraints), `upsertProviderFromTebra(data: TebraProvider): Promise<void>`,
  `upsertChargeFromTebra(data: TebraCharge): Promise<void>` — this one also upserts one
  `insuranceClaims` row per non-null insurance tier on `data` (primary/secondary/tertiary), each
  matched on `(chargeId, payerName)` since Tebra's charge payload doesn't give claims their own
  stable ID independent of the charge.

- [ ] **Step 1: Write the failing tests** — one per function: calling it twice with the same
  `tebraId` and changed fields results in exactly one row, with updated values (update-not-insert
  on re-sync); calling `upsertChargeFromTebra` with all three insurance tiers populated produces
  exactly 3 `insuranceClaims` rows; calling it again with only primary populated leaves secondary/
  tertiary rows from the first call untouched (Tebra not reporting a tier isn't the same as that
  tier being removed — do not delete on a partial payload).

- [ ] **Step 2: Run tests to verify they fail** — expected: FAIL.

- [ ] **Step 3: Implement** each as a Drizzle `insert(...).onConflictDoUpdate({target:
  [table.tebraId], set: {...}})`, relying on Task 1's unique index on `tebraId`.

- [ ] **Step 4: Run tests to verify they pass** — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/appointments.ts src/lib/queries/providers.ts src/lib/queries/charges.ts tests/lib/queries/appointments.test.ts tests/lib/queries/providers.test.ts tests/lib/queries/charges.test.ts
git commit -m "sync: add upsert-from-Tebra for appointments, providers, charges, insurance claims"
```

---

### Task 6: Upsert-from-Tebra — payments, encounters, reference data

**Files:**
- Create: `src/lib/queries/payments.ts`
- Create: `src/lib/queries/encounters.ts`
- Create: `src/lib/queries/service-locations.ts`
- Create: `src/lib/queries/procedure-codes.ts`
- Test: `tests/lib/queries/payments.test.ts`, `tests/lib/queries/encounters.test.ts`,
  `tests/lib/queries/service-locations.test.ts`, `tests/lib/queries/procedure-codes.test.ts`

**Interfaces:**
- Consumes: `TebraPayment`, `TebraEncounterDetail`, `TebraServiceLocation`, `TebraProcedureCode`
  from Task 2.
- Produces: `upsertPaymentFromTebra(data: TebraPayment): Promise<void>`,
  `upsertEncounterFromTebra(data: TebraEncounterDetail): Promise<void>`,
  `getEncounterByTebraId(tebraId: string): Promise<{id: number} | null>` (this is what the sync
  engine in Task 7 uses to check "already have this encounter" before spending a
  `GetEncounterDetails` call — Review Focus's duplicate-fetch case), `upsertServiceLocationFromTebra`,
  `upsertProcedureCodeFromTebra` (same shape as `upsertProviderFromTebra`).

- [ ] **Step 1: Write the failing tests** — same update-not-duplicate assertion pattern as Task 5;
  `getEncounterByTebraId` returns `null` before any upsert, the row's `id` after.

- [ ] **Step 2: Run tests to verify they fail** — expected: FAIL.

- [ ] **Step 3: Implement** — same `onConflictDoUpdate` pattern as Task 5.

- [ ] **Step 4: Run tests to verify they pass** — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/payments.ts src/lib/queries/encounters.ts src/lib/queries/service-locations.ts src/lib/queries/procedure-codes.ts tests/lib/queries/payments.test.ts tests/lib/queries/encounters.test.ts tests/lib/queries/service-locations.test.ts tests/lib/queries/procedure-codes.test.ts
git commit -m "sync: add upsert-from-Tebra for payments, encounters, service locations, procedure codes"
```

---

### Task 7: Sync engine orchestrator

**Files:**
- Create: `src/lib/tebra-sync.ts`
- Test: `tests/lib/tebra-sync.test.ts`

**Interfaces:**
- Consumes: `TebraConnector` (Task 2/3), all `upsert*FromTebra` functions (Tasks 5-6),
  `getCursor`/`claimCursor`/`releaseCursor`/`recordSyncRun` (Task 4).
- Produces: `runIncrementalSync(client: TebraConnector, practiceId: string, now: () => Date =
  Date.now): Promise<void>` — pulls patients → appointments → charges → payments in that order,
  each gated by its own `claimCursor` (skip that entity type entirely if the claim fails — Review
  Focus's overlap case — but still attempt the others), upserts, discovers new `EncounterID`s from
  this run's charges, calls `getEncounterByTebraId` before `getEncounterDetails` for each (Review
  Focus's no-duplicate-fetch case), and `releaseCursor`s with `outcome: 'idle'` on success or
  `'failed'` on a caught `EhrConnectorError` (the entity's cursor does **not** advance on failure —
  Global Constraints). `runReferenceSync(client, practiceId): Promise<void>` — same shape for
  providers/serviceLocations/procedureCodes, no `FromLastModifiedDate` filter (full pull each
  time — these lists are small).

- [ ] **Step 1: Write the failing tests** — inject a fake `TebraConnector` (a plain object
  implementing the interface) returning a fixed fake dataset and a fake `now`; assert: an empty
  `getAppointments`/`getCharges` result still releases the cursor to the fake `now()` (Review
  Focus's empty-pull case); a charge referencing an `EncounterID` already present in `encounters`
  does not call the fake `getEncounterDetails` a second time; a `getCharges` call rejecting with
  `EhrConnectorError` leaves that entity's cursor un-advanced while `appointments`'s cursor still
  advances in the same run (per-entity isolation); `claimCursor` returning `false` for an entity
  (simulating an overlapping run) skips that entity without throwing.

- [ ] **Step 2: Run tests to verify they fail** — expected: FAIL.

- [ ] **Step 3: Implement** `runIncrementalSync`/`runReferenceSync` per the Produces block above.

- [ ] **Step 4: Run tests to verify they pass** — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tebra-sync.ts tests/lib/tebra-sync.test.ts
git commit -m "sync: add runIncrementalSync/runReferenceSync orchestrator"
```

---

### Task 8: Cron endpoints

**Files:**
- Create: `src/app/api/cron/tebra-sync/route.ts`
- Create: `src/app/api/cron/tebra-sync-reference/route.ts`
- Create: `vercel.json`
- Test: `tests/api/cron-tebra-sync.test.ts`

**Interfaces:**
- Consumes: `runIncrementalSync`/`runReferenceSync` (Task 7); a real `TebraConnector` constructed
  from the practice's stored credentials (same `createTebraClient` call shape
  `settings.ts`/`ehr-sync.ts` already use elsewhere in this codebase).
- Produces: `GET /api/cron/tebra-sync` and `GET /api/cron/tebra-sync-reference` — Vercel Cron's
  documented auth convention: reject with 401 unless `Authorization: Bearer ${process.env.
  CRON_SECRET}` matches exactly.

- [ ] **Step 1: Write the failing tests** — a request with no/wrong `Authorization` header gets
  401 before the sync engine is ever invoked (mock `runIncrementalSync` and assert it was not
  called); a request with the correct header invokes it and returns 200.

- [ ] **Step 2: Run tests to verify they fail** — expected: FAIL.

- [ ] **Step 3: Implement** both routes with the auth check first, then `vercel.json`:
  ```json
  { "crons": [
    { "path": "/api/cron/tebra-sync", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/tebra-sync-reference", "schedule": "0 3 * * *" }
  ]}
  ```

- [ ] **Step 4: Run tests to verify they pass** — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/tebra-sync src/app/api/cron/tebra-sync-reference vercel.json tests/api/cron-tebra-sync.test.ts
git commit -m "sync: add cron endpoints for incremental and reference-data sync"
```

---

### Task 9: Native-create tagging + encounters resource

**Files:**
- Modify: `src/app/api/appointments/route.ts:48-56` (the `POST` handler's insert)
- Modify: `src/app/api/charges/route.ts` (the `createCharge` call site)
- Modify: `src/lib/queries/charges.ts` (`createCharge`'s insert)
- Create: `src/app/api/encounters/route.ts`
- Create: `src/lib/queries/encounters.ts` additions: `createEncounter`, `getEncounter`, `listEncounters`
- Modify: `tests/api/route-gates.test.ts` — add rows for the new encounters routes
- Test: `tests/api/encounters.test.ts`

**Interfaces:**
- Consumes: `encounters` table (Task 1).
- Produces: `POST /api/appointments` and `POST /api/charges` now insert `source: 'clinsync'`,
  `tebraId: null` explicitly (previously these columns didn't exist). `POST /api/encounters` /
  `GET /api/encounters` / `GET /api/encounters/[id]` — gated by `requireSession()` only, **no**
  `canAccessOperations` gate (per the Global Constraints' resolution of spec §5: encounters are
  clinical data, visible to every staff role including PI, unlike charges/payments which already
  correctly exclude PI via the existing `canAccessOperations`).

- [ ] **Step 1: Write the failing tests** — `route-gates.test.ts` rows:
  `['encounters', 'GET', 'staff']`, `['encounters', 'POST', 'staff']` — any staff role, not just
  operations roles (confirms PI is NOT excluded, the opposite assertion from every billing route);
  `tests/api/encounters.test.ts`: a created encounter round-trips with `source: 'clinsync'`.

- [ ] **Step 2: Run tests to verify they fail** — expected: FAIL.

- [ ] **Step 3: Implement** — one-line additions to the two existing insert calls; the new
  encounters route follows the exact shape of the existing `POST /api/appointments` (schema →
  parse → insert → audit log).

- [ ] **Step 4: Run tests to verify they pass** — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/appointments/route.ts src/app/api/charges/route.ts src/lib/queries/charges.ts src/app/api/encounters tests/api/route-gates.test.ts tests/api/encounters.test.ts
git commit -m "api: tag native creates as source=clinsync, add native encounters resource"
```

---

### Task 10: Billing read routes with correct role gates

**Files:**
- Create: `src/app/api/payments/route.ts`
- Modify: `tests/api/route-gates.test.ts` — add a row for the new payments route

**Interfaces:**
- Consumes: `listPayments` (add to `src/lib/queries/payments.ts` from Task 6).
- Produces: `GET /api/payments` gated by the existing `canAccessOperations` (reused directly —
  no new predicate, per this plan's header note on simplifying spec §5).

- [ ] **Step 1: Write the failing test** — `route-gates.test.ts` row:
  `['payments', 'GET', OPS]` (the existing `OPS` constant already used by `charges`/`workbook`
  rows in that file).

- [ ] **Step 2: Run test to verify it fails** — expected: FAIL.

- [ ] **Step 3: Implement** — same shape as the existing `GET /api/charges`.

- [ ] **Step 4: Run test to verify it passes** — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/payments tests/api/route-gates.test.ts
git commit -m "api: add GET /api/payments, operations-gated"
```

---

## Addendum: the existing `diagnoses`/`medicationEpisodes` pathway

Caught in self-review, not in the original spec: `src/lib/ehr-sync.ts` already has a working
refresh flow that deletes and re-inserts a patient's `diagnoses`/`medicationEpisodes` rows
(`source: 'tebra'` — this exact tagging convention already exists elsewhere in this codebase, one
more precedent for this plan's approach) by calling the connector's `getConditions()`/
`getActiveMedications()`/`getInactiveMedications()`. The real client stubs all three to `[]`
today (`supportsClinicalData: false`).

Two things this plan must get right, not paper over:

1. **Medications can never be made real from this API.** Confirmed against the full, live WSDL
   operation list (Task 3's research): there is no medication-related SOAP operation in Tebra's
   2.1 API at all. `getActiveMedications`/`getInactiveMedications` stay `[]` forever unless Tebra
   ships a newer API version — this is a hard vendor limitation, not a task this plan or Plan 2
   deferred.
2. **`diagnoses` (patient-level problem list) and `charges.diagnosisCodes` (per-claim-line,
   Task 5) are different clinical concepts, not duplicates** — one is "what's on this patient's
   active chart," the other is "what was billed for on this specific line item." Implementing a
   real `getConditions()` (via per-encounter `GetEncounterDetails` calls, the only way Tebra
   exposes a diagnosis at all) is in-scope future work this plan doesn't claim to close — it's a
   genuinely separate, smaller follow-on task once Tebra account access is confirmed, not blocked
   on anything in Tasks 1-10 above. Flagging it here so it isn't silently assumed solved.

## Self-Review Notes

- **Spec coverage:** §3 (data model) — Task 1, 5, 6. §4 (sync engine) — Tasks 3, 4, 7, 8. §5's
  native-create half — Task 9. §5's role-gate half for billing/clinical split — Tasks 9-10 (with
  the `canViewBilling` simplification noted). §6 (HIPAA) — no dedicated task: encryption applies
  only when SSN/insurance-ID *values* are actually stored, which Plan 2 (document/PHI-field
  surfacing) owns, since Plan 1's `TebraCharge`/`TebraAppointment` mapped shapes in this plan don't
  carry SSN. §7 (error handling) — Task 7's tests. §8 (testing) — covered throughout; real
  end-to-end verification explicitly deferred (spec §9, Global Constraints).
- **Proportion check:** 10 tasks for a spec with 6 new/extended tables, 7 new connector methods,
  a sync orchestrator, and 2 cron endpoints is proportionate — no task repeats another's code.
