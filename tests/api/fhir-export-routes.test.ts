import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDb } from '@/db/client'
import { patients, allergies, diagnoses } from '@/db/schema'

let sessionRole: 'admin' | 'pi' | 'crc' | 'frontdesk' | null = 'crc'
vi.mock('@/lib/auth', () => ({
  requireSession: vi.fn(async () =>
    sessionRole === null
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : { role: sessionRole, name: 'Test Staff' }
  ),
}))

import { GET as getPatient } from '@/app/api/patients/[anonId]/fhir/Patient/route'
import { GET as getAllergyIntolerance } from '@/app/api/patients/[anonId]/fhir/AllergyIntolerance/route'
import { GET as getCondition } from '@/app/api/patients/[anonId]/fhir/Condition/route'
import { GET as getMedicationRequest } from '@/app/api/patients/[anonId]/fhir/MedicationRequest/route'
import { GET as getMedicationDispense } from '@/app/api/patients/[anonId]/fhir/MedicationDispense/route'
import { GET as getObservation } from '@/app/api/patients/[anonId]/fhir/Observation/route'
import { GET as getBundle } from '@/app/api/patients/[anonId]/fhir/Bundle/route'

const ROUTES = [
  { name: 'Patient', handler: getPatient },
  { name: 'AllergyIntolerance', handler: getAllergyIntolerance },
  { name: 'Condition', handler: getCondition },
  { name: 'MedicationRequest', handler: getMedicationRequest },
  { name: 'MedicationDispense', handler: getMedicationDispense },
  { name: 'Observation', handler: getObservation },
  { name: 'Bundle', handler: getBundle },
] as const

const EMPTY_BUNDLE_ROUTES = [
  { name: 'AllergyIntolerance', handler: getAllergyIntolerance },
  { name: 'Condition', handler: getCondition },
  { name: 'MedicationRequest', handler: getMedicationRequest },
  { name: 'MedicationDispense', handler: getMedicationDispense },
  { name: 'Observation', handler: getObservation },
] as const

function req() {
  return new Request('http://localhost')
}

function callRoute(handler: (request: Request, ctx: { params: Promise<{ anonId: string }> }) => Promise<Response>, anonId: string) {
  return handler(req(), { params: Promise.resolve({ anonId }) })
}

const createdPatientIds: string[] = []
const createdAllergyIds: number[] = []
const createdDiagnosisIds: number[] = []

let patientAId: string
let patientBId: string
let patientEmptyId: string

beforeAll(async () => {
  const db = getDb()

  const [patientA] = await db.insert(patients).values({
    id: 'RD-FHIR-ROUTES-A', intakeqClientIdRef: 'test-ref-routes-a', nameIntakeq: 'Route Patient A', dobIntakeq: '1980-01-01',
  }).returning()
  createdPatientIds.push(patientA.id)
  patientAId = patientA.id

  const [patientB] = await db.insert(patients).values({
    id: 'RD-FHIR-ROUTES-B', intakeqClientIdRef: 'test-ref-routes-b', nameIntakeq: 'Route Patient B', dobIntakeq: '1981-01-01',
  }).returning()
  createdPatientIds.push(patientB.id)
  patientBId = patientB.id

  const [patientEmpty] = await db.insert(patients).values({
    id: 'RD-FHIR-ROUTES-EMPTY', intakeqClientIdRef: 'test-ref-routes-empty', nameIntakeq: 'Route Patient Empty', dobIntakeq: '1982-01-01',
  }).returning()
  createdPatientIds.push(patientEmpty.id)
  patientEmptyId = patientEmpty.id

  const [allergyA] = await db.insert(allergies).values({
    patientId: patientA.id, allergen: 'Penicillin-RouteA', reaction: 'Hives', severity: 'moderate',
  }).returning()
  createdAllergyIds.push(allergyA.id)

  const [allergyB] = await db.insert(allergies).values({
    patientId: patientB.id, allergen: 'Latex-RouteB', reaction: 'Rash', severity: 'mild',
  }).returning()
  createdAllergyIds.push(allergyB.id)

  const [diagnosisA] = await db.insert(diagnoses).values({
    patientId: patientA.id, code: 'J45.909', description: 'Asthma-RouteA', source: 'tebra', date: '2024-01-01',
  }).returning()
  createdDiagnosisIds.push(diagnosisA.id)

  const [diagnosisB] = await db.insert(diagnoses).values({
    patientId: patientB.id, code: 'E11.9', description: 'Diabetes-RouteB', source: 'tebra', date: '2024-01-01',
  }).returning()
  createdDiagnosisIds.push(diagnosisB.id)
})

afterAll(async () => {
  const db = getDb()
  while (createdAllergyIds.length > 0) await db.delete(allergies).where(eq(allergies.id, createdAllergyIds.pop()!))
  while (createdDiagnosisIds.length > 0) await db.delete(diagnoses).where(eq(diagnoses.id, createdDiagnosisIds.pop()!))
  while (createdPatientIds.length > 0) await db.delete(patients).where(eq(patients.id, createdPatientIds.pop()!))
})

afterEach(() => {
  sessionRole = 'crc'
})

describe('FHIR export routes -- session gating', () => {
  it('returns 401 from every route when there is no authenticated session', async () => {
    sessionRole = null
    for (const { handler } of ROUTES) {
      const res = await callRoute(handler, patientAId)
      expect(res.status).toBe(401)
    }
  })

  it('returns 200 from every route for a crc session', async () => {
    sessionRole = 'crc'
    for (const { handler } of ROUTES) {
      const res = await callRoute(handler, patientAId)
      expect(res.status).toBe(200)
    }
  })
})

describe('FHIR export routes -- patient scoping (two patients never cross)', () => {
  it('AllergyIntolerance for patientA contains only patientA\'s allergen', async () => {
    const resA = await callRoute(getAllergyIntolerance, patientAId)
    const bodyA = await resA.json()
    const textA = JSON.stringify(bodyA)
    expect(textA).toContain('Penicillin-RouteA')
    expect(textA).not.toContain('Latex-RouteB')

    const resB = await callRoute(getAllergyIntolerance, patientBId)
    const bodyB = await resB.json()
    const textB = JSON.stringify(bodyB)
    expect(textB).toContain('Latex-RouteB')
    expect(textB).not.toContain('Penicillin-RouteA')
  })

  it('Condition for patientA contains only patientA\'s diagnosis', async () => {
    const resA = await callRoute(getCondition, patientAId)
    const bodyA = await resA.json()
    const textA = JSON.stringify(bodyA)
    expect(textA).toContain('Asthma-RouteA')
    expect(textA).not.toContain('Diabetes-RouteB')

    const resB = await callRoute(getCondition, patientBId)
    const bodyB = await resB.json()
    const textB = JSON.stringify(bodyB)
    expect(textB).toContain('Diabetes-RouteB')
    expect(textB).not.toContain('Asthma-RouteA')
  })

  it('Bundle for patientA contains only patientA\'s allergen and diagnosis', async () => {
    const resA = await callRoute(getBundle, patientAId)
    const bodyA = await resA.json()
    const textA = JSON.stringify(bodyA)
    expect(textA).toContain('Penicillin-RouteA')
    expect(textA).toContain('Asthma-RouteA')
    expect(textA).not.toContain('Latex-RouteB')
    expect(textA).not.toContain('Diabetes-RouteB')

    const resB = await callRoute(getBundle, patientBId)
    const bodyB = await resB.json()
    const textB = JSON.stringify(bodyB)
    expect(textB).toContain('Latex-RouteB')
    expect(textB).toContain('Diabetes-RouteB')
    expect(textB).not.toContain('Penicillin-RouteA')
    expect(textB).not.toContain('Asthma-RouteA')
  })
})

describe('FHIR export routes -- empty Bundle, not an error', () => {
  it('every Bundle-returning resource route for a data-free patient returns an empty, well-formed Bundle', async () => {
    for (const { handler } of EMPTY_BUNDLE_ROUTES) {
      const res = await callRoute(handler, patientEmptyId)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ resourceType: 'Bundle', type: 'collection', total: 0, entry: [] })
    }
  })

  it('/fhir/Bundle for a data-free patient returns total: 1 (just the Patient resource)', async () => {
    const res = await callRoute(getBundle, patientEmptyId)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resourceType).toBe('Bundle')
    expect(body.total).toBe(1)
    expect(body.entry).toHaveLength(1)
    expect(body.entry[0].resource.resourceType).toBe('Patient')
  })
})

describe('FHIR export routes -- unknown anonId', () => {
  it('returns 404, not a 500, from every route for an unknown anonId', async () => {
    for (const { handler } of ROUTES) {
      const res = await callRoute(handler, 'RD-FHIR-ROUTES-DOES-NOT-EXIST')
      expect(res.status).toBe(404)
    }
  })
})

describe('FHIR export routes -- /fhir/Patient shape', () => {
  it('returns a bare Patient resource, not a Bundle', async () => {
    const res = await callRoute(getPatient, patientAId)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resourceType).toBe('Patient')
    expect(body.entry).toBeUndefined()
  })
})
