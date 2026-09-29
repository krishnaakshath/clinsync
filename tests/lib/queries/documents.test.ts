import { describe, it, expect, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { documents, admissions, patients, providers } from '@/db/schema'
import {
  listDocuments,
  getDocument,
  createDocument,
  listDocumentsForPatient,
  isAdmissionForPatient,
} from '@/lib/queries/documents'

describe('listDocuments', () => {
  it('returns the seeded documents joined with patient info', async () => {
    const rows = await listDocuments()
    expect(rows.length).toBeGreaterThanOrEqual(10)
    const linked = rows.find((d) => d.patientId === 'RD-0001')
    expect(linked?.patientName).toBeTruthy()
  })
})

describe('getDocument', () => {
  it('returns null for a non-existent id', async () => {
    const result = await getDocument(999999)
    expect(result).toBeNull()
  })
})

const createdDocumentIds: number[] = []
const createdAdmissionIds: number[] = []

afterEach(async () => {
  const db = getDb()
  while (createdDocumentIds.length > 0) {
    await db.delete(documents).where(eq(documents.id, createdDocumentIds.pop()!))
  }
  while (createdAdmissionIds.length > 0) {
    await db.delete(admissions).where(eq(admissions.id, createdAdmissionIds.pop()!))
  }
})

describe('createDocument', () => {
  it('creates a document with patientId: null and leaves filing/admission fields null', async () => {
    const created = await createDocument({
      name: 'Unassigned scan.pdf',
      documentDate: '2026-09-29',
      receivedFrom: 'Fax',
      documentType: 'other',
      patientId: null,
      admissionId: null,
      fileUrl: 'https://blob.test/documents/abc-unassigned-scan.pdf',
      fileType: 'PDF',
      filedByName: null,
      filedAt: null,
    })
    createdDocumentIds.push(created.id)

    expect(created.status).toBe('new')
    expect(created.patientId).toBeNull()
    expect(created.filedByName).toBeNull()
    expect(created.filedAt).toBeNull()
    expect(created.admissionId).toBeNull()
    expect(created.fileUrl).toBe('https://blob.test/documents/abc-unassigned-scan.pdf')
  })

  it('creates a document with a real patientId and supplied filing info', async () => {
    const filedAt = new Date('2026-09-29T12:00:00Z')
    const created = await createDocument({
      name: 'Filed consent.pdf',
      documentDate: '2026-09-29',
      receivedFrom: 'Jamie Ruiz (CRC)',
      documentType: 'legal_document',
      patientId: 'RD-0001',
      admissionId: null,
      fileUrl: 'https://blob.test/documents/xyz-filed-consent.pdf',
      fileType: 'PDF',
      filedByName: 'Jamie Ruiz',
      filedAt,
    })
    createdDocumentIds.push(created.id)

    expect(created.patientId).toBe('RD-0001')
    expect(created.filedByName).toBe('Jamie Ruiz')
    expect(created.filedAt).toEqual(filedAt)
  })
})

describe('listDocumentsForPatient', () => {
  it("returns only RD-0001's documents, each with an admissionId property", async () => {
    const rows = await listDocumentsForPatient('RD-0001')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.patientId).toBe('RD-0001')
      expect(row).toHaveProperty('admissionId')
    }
  })

  it('returns [] for a patient id with no documents', async () => {
    const rows = await listDocumentsForPatient('RD-0001-no-such-suffix')
    expect(rows).toEqual([])
  })
})

describe('isAdmissionForPatient', () => {
  it('is true for the admission paired with its own patient, false for another patient, and false for a non-existent admission', async () => {
    const db = getDb()
    // Narrow selects only -- the live `patients` table has columns from other
    // in-flight branches not yet reflected in this branch's schema.ts, so a
    // bare select().from(patients) can 42703 on an unrelated column.
    const patientRows = await db.select({ id: patients.id }).from(patients).limit(2)
    const [providerRow] = await db.select({ id: providers.id }).from(providers).limit(1)
    const [patientA, patientB] = patientRows

    const [admission] = await db
      .insert(admissions)
      .values({ patientId: patientA.id, attendingProviderId: providerRow.id })
      .returning()
    createdAdmissionIds.push(admission.id)

    await expect(isAdmissionForPatient(admission.id, patientA.id)).resolves.toBe(true)
    await expect(isAdmissionForPatient(admission.id, patientB.id)).resolves.toBe(false)
    await expect(isAdmissionForPatient(999999, patientA.id)).resolves.toBe(false)
  })
})
