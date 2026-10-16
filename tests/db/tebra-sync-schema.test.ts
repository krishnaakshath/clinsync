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
      lastSyncedAt: new Date('2024-01-01'),
      status: 'idle',
    }).returning()

    const inserted = await getDb()
      .select()
      .from(syncCursors)
      .where(eq(syncCursors.id, result[0].id))

    expect(inserted.length).toBe(1)
    expect(inserted[0].entityType).toBe('patient')
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
})
