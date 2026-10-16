import { describe, it, expect, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import {
  appointments,
  charges,
  providers,
  insuranceClaims,
  documents,
  encounters,
  payments,
  serviceLocations,
  procedureCodes,
  syncCursors,
  syncRuns,
} from '@/db/schema'
import { seed } from '@/db/seed'

describe('Tebra sync schema', () => {
  beforeAll(async () => {
    await seed()
  }, 60000)

  it('existing appointments have source=clinsync and tebraId=null', async () => {
    const rows = await getDb().select().from(appointments).limit(1)
    expect(rows.length).toBeGreaterThan(0)
    const row = rows[0]
    expect(row.source).toBe('clinsync')
    expect(row.tebraId).toBeNull()
  })

  it('can insert into encounters with only required fields', async () => {
    // First, get a patient and provider for FK references
    const [patient] = await getDb().select().from(appointments).limit(1)
    expect(patient).toBeDefined()

    const [provider] = await getDb().select().from(providers).limit(1)
    expect(provider).toBeDefined()

    const [serviceLocation] = await getDb().select().from(serviceLocations).limit(1)
    expect(serviceLocation).toBeDefined()

    const result = await getDb().insert(encounters).values({
      tebraId: 'test-encounter-1',
      patientId: patient.patientId,
      providerId: provider.id,
      serviceLocationId: serviceLocation.id,
      serviceStartDate: new Date('2024-01-01'),
      serviceEndDate: new Date('2024-01-01'),
      status: 'completed',
    }).returning()

    const inserted = await getDb()
      .select()
      .from(encounters)
      .where(eq(encounters.id, result[0].id))

    expect(inserted.length).toBe(1)
    expect(inserted[0].tebraId).toBe('test-encounter-1')
  })

  it('can insert into payments with only required fields', async () => {
    const [patient] = await getDb().select().from(appointments).limit(1)
    expect(patient).toBeDefined()

    const result = await getDb().insert(payments).values({
      tebraId: 'test-payment-1',
      patientId: patient.patientId,
      payerName: 'Test Payer',
      payerType: 'insurance',
      amountCents: 10000,
      method: 'electronic',
      postedDate: new Date('2024-01-01'),
    }).returning()

    const inserted = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.id, result[0].id))

    expect(inserted.length).toBe(1)
    expect(inserted[0].tebraId).toBe('test-payment-1')
  })

  it('can insert into serviceLocations with only required fields', async () => {
    const result = await getDb().insert(serviceLocations).values({
      tebraId: 'test-location-1',
      name: 'Test Location',
    }).returning()

    const inserted = await getDb()
      .select()
      .from(serviceLocations)
      .where(eq(serviceLocations.id, result[0].id))

    expect(inserted.length).toBe(1)
    expect(inserted[0].name).toBe('Test Location')
  })

  it('can insert into procedureCodes with only required fields', async () => {
    const result = await getDb().insert(procedureCodes).values({
      tebraId: 'test-code-1',
      code: 'TEST-001',
      description: 'Test Procedure',
    }).returning()

    const inserted = await getDb()
      .select()
      .from(procedureCodes)
      .where(eq(procedureCodes.id, result[0].id))

    expect(inserted.length).toBe(1)
    expect(inserted[0].code).toBe('TEST-001')
  })

  it('can insert into syncCursors with only required fields', async () => {
    const result = await getDb().insert(syncCursors).values({
      entityType: 'patient',
      practiceId: 'test-practice-1',
      lastSyncedAt: new Date('2024-01-01'),
      status: 'idle',
    }).returning()

    const inserted = await getDb()
      .select()
      .from(syncCursors)
      .where(eq(syncCursors.id, result[0].id))

    expect(inserted.length).toBe(1)
    expect(inserted[0].entityType).toBe('patient')
    expect(inserted[0].practiceId).toBe('test-practice-1')
  })

  it('can insert into syncRuns with only required fields', async () => {
    const result = await getDb().insert(syncRuns).values({
      entityType: 'patient',
      startedAt: new Date('2024-01-01'),
      recordsProcessed: 10,
      outcome: 'ok',
    }).returning()

    const inserted = await getDb()
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, result[0].id))

    expect(inserted.length).toBe(1)
    expect(inserted[0].outcome).toBe('ok')
  })

  it('appointments, charges, providers, insuranceClaims, documents all have source column', async () => {
    const [appt] = await getDb().select().from(appointments).limit(1)
    expect(appt).toBeDefined()
    expect(appt.source).toBeDefined()
    expect(['tebra', 'clinsync']).toContain(appt.source)

    const [charge] = await getDb().select().from(charges).limit(1)
    expect(charge).toBeDefined()
    expect(charge.source).toBeDefined()

    const [provider] = await getDb().select().from(providers).limit(1)
    expect(provider).toBeDefined()
    expect(provider.source).toBeDefined()

    const [claim] = await getDb().select().from(insuranceClaims).limit(1)
    expect(claim).toBeDefined()
    expect(claim.source).toBeDefined()

    const [doc] = await getDb().select().from(documents).limit(1)
    expect(doc).toBeDefined()
    expect(doc.source).toBeDefined()
  })

  it('documents have blob storage columns', async () => {
    const [doc] = await getDb().select().from(documents).limit(1)
    expect(doc).toBeDefined()
    expect(doc.blobKey).toBeDefined()
    expect(doc.fileSizeBytes).toBeDefined()
    expect(doc.uploadedBy).toBeDefined()
    expect(doc.patientVisible).toBeDefined()
    expect(doc.patientVisible).toBe(false)
  })

  it('charges have encounterId column', async () => {
    const [charge] = await getDb().select().from(charges).limit(1)
    expect(charge).toBeDefined()
    expect('encounterId' in charge).toBe(true)
  })

  // --- Fix Round 1 (review findings) ---
  // The following tests depend on DDL hand-written in drizzle/0006_task1_fixes.sql
  // that this task is NOT permitted to apply to the live dev database (db:generate/
  // db:push are both broken in this worktree; see task-1-report.md's Fix Round 1
  // section). They are written now so they pass the moment the controller applies
  // that migration by hand. Until then, expect them to fail/error against the
  // live (pre-fix) schema for the reasons noted in each test.

  it('rejects a duplicate tebraId on encounters (NOT NULL tebraId, plain unique index) [pending drizzle/0006_task1_fixes.sql]', async () => {
    const [patient] = await getDb().select().from(appointments).limit(1)
    const [provider] = await getDb().select().from(providers).limit(1)
    const [serviceLocation] = await getDb().select().from(serviceLocations).limit(1)
    const dupeTebraId = `dupe-encounter-${Date.now()}`
    const insertOnce = () => getDb().insert(encounters).values({
      tebraId: dupeTebraId,
      patientId: patient.patientId,
      providerId: provider.id,
      serviceLocationId: serviceLocation.id,
      serviceStartDate: '2024-01-01',
      serviceEndDate: '2024-01-01',
      status: 'completed',
    })
    await insertOnce()
    await expect(insertOnce()).rejects.toThrow()
  })

  it('rejects a duplicate non-null tebraId on appointments (nullable tebraId, partial unique index) [pending drizzle/0006_task1_fixes.sql]', async () => {
    const [patient] = await getDb().select().from(appointments).limit(1)
    const [provider] = await getDb().select().from(providers).limit(1)
    const dupeTebraId = `dupe-appointment-${Date.now()}`
    const insertOnce = () => getDb().insert(appointments).values({
      patientId: patient.patientId,
      providerId: provider.id,
      startsAt: new Date('2024-01-01T10:00:00Z'),
      endsAt: new Date('2024-01-01T10:30:00Z'),
      visitReason: 'Fix Round 1 duplicate-tebraId test',
      source: 'tebra',
      tebraId: dupeTebraId,
    })
    await insertOnce()
    await expect(insertOnce()).rejects.toThrow()
  })

  it('allows multiple appointments with null tebraId (partial index only covers non-null values)', async () => {
    const [patient] = await getDb().select().from(appointments).limit(1)
    const [provider] = await getDb().select().from(providers).limit(1)
    const insertOne = () => getDb().insert(appointments).values({
      patientId: patient.patientId,
      providerId: provider.id,
      startsAt: new Date('2024-01-01T11:00:00Z'),
      endsAt: new Date('2024-01-01T11:30:00Z'),
      visitReason: 'Fix Round 1 null-tebraId test',
    })
    await expect(insertOne()).resolves.toBeDefined()
    await expect(insertOne()).resolves.toBeDefined()
  })

  it('rejects a charges.encounterId that does not reference a real encounter (new FK) [pending drizzle/0006_task1_fixes.sql]', async () => {
    const [patient] = await getDb().select().from(appointments).limit(1)
    await expect(
      getDb().insert(charges).values({
        patientId: patient.patientId,
        providerName: 'Fix Round 1 FK test',
        dateOfService: '2024-01-01',
        diagnosisCodes: [],
        procedureCodes: [],
        amountCents: 100,
        encounterId: 99999999, // does not exist in encounters
      })
    ).rejects.toThrow()
  })

  it('rejects a duplicate (entityType, practiceId) pair on syncCursors (new composite unique index) [pending drizzle/0006_task1_fixes.sql]', async () => {
    const practiceId = `dupe-practice-${Date.now()}`
    const insertOnce = () => getDb().insert(syncCursors).values({
      entityType: 'charge',
      practiceId,
      lastSyncedAt: new Date('2024-01-01'),
      status: 'idle',
    })
    await insertOnce()
    await expect(insertOnce()).rejects.toThrow()
  })
})
