import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST as createSessionRoute } from '@/app/api/appointments/[id]/telemedicine/route'
import { POST as signalPost, GET as signalGet } from '@/app/api/telemedicine/[sessionId]/signal/route'
import { POST as endPost } from '@/app/api/telemedicine/[sessionId]/end/route'
import { getDb } from '@/db/client'
import { patients, appointments, telemedicineSessions, telemedicineSignals } from '@/db/schema'
import { createTelemedicineSession } from '@/lib/queries/telemedicine-sessions'
import { listSignalsSince } from '@/lib/queries/telemedicine-signals'

// Mocked provider roster distinct from the real seeded providers table --
// the ownership check resolves session.name -> this mocked roster -> an id,
// which is then compared against the *real* appointment's providerId. This
// mirrors tests/api/inpatient-admissions-discharge.test.ts's pattern.
const MATCHING_PROVIDER_ID = 1 // real seeded provider id (Dr. Rajiv Kunam)
let sessionRole: 'admin' | 'pi' | 'crc' | 'frontdesk' = 'pi'
let sessionName = 'Dr. Chen'
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: sessionRole, name: sessionName })) }))
vi.mock('@/lib/queries/providers', () => ({
  listActiveProviders: vi.fn(async () => [{ id: MATCHING_PROVIDER_ID, name: 'Dr. Chen', credentials: null, specialty: 'Psychiatry', colorTag: 'chart-1', isActive: true }]),
}))

const createdAppointmentIds: number[] = []
afterEach(async () => {
  sessionRole = 'pi'
  sessionName = 'Dr. Chen'
  while (createdAppointmentIds.length > 0) {
    const id = createdAppointmentIds.pop()!
    const [session] = await getDb().select().from(telemedicineSessions).where(eq(telemedicineSessions.appointmentId, id))
    if (session) {
      await getDb().delete(telemedicineSignals).where(eq(telemedicineSignals.sessionId, session.id))
      await getDb().delete(telemedicineSessions).where(eq(telemedicineSessions.id, session.id))
    }
    await getDb().delete(appointments).where(eq(appointments.id, id))
  }
})

async function makeAppointment(providerId: number) {
  const db = getDb()
  const [patientRow] = await db.select().from(patients).limit(1)
  const [appt] = await db.insert(appointments).values({
    patientId: patientRow.id, providerId,
    startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 60000), visitReason: 'Telemedicine test',
  }).returning()
  createdAppointmentIds.push(appt.id)
  return appt
}

async function makeSession(providerId: number) {
  const appt = await makeAppointment(providerId)
  const { session } = await createTelemedicineSession(appt.id)
  return session!
}

function jsonReq(body: unknown) {
  return new Request('http://localhost', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}

function getReq(url: string) {
  return new Request(url, { method: 'GET' })
}

describe('POST /api/telemedicine/[sessionId]/signal ownership', () => {
  it('a pi session whose name matches the appointment provider succeeds on POST and GET', async () => {
    const session = await makeSession(MATCHING_PROVIDER_ID)
    sessionRole = 'pi'
    sessionName = 'Dr. Chen'

    const postRes = await signalPost(jsonReq({ signalType: 'offer', payload: { sdp: 'x' } }) as never, { params: Promise.resolve({ sessionId: String(session.id) }) })
    expect(postRes.status).toBe(201)

    const getRes = await signalGet(getReq(`http://localhost/api/telemedicine/${session.id}/signal?for=patient`) as never, { params: Promise.resolve({ sessionId: String(session.id) }) })
    expect(getRes.status).toBe(200)
  })

  it('a pi session whose name does not match the appointment provider gets 403 on POST and GET (Review Focus #1)', async () => {
    const otherProviderId = 2 // real seeded provider, distinct from MATCHING_PROVIDER_ID
    const session = await makeSession(otherProviderId)
    sessionRole = 'pi'
    sessionName = 'Dr. Chen' // resolves via mocked roster to MATCHING_PROVIDER_ID, which owns a different session

    const postRes = await signalPost(jsonReq({ signalType: 'offer', payload: { sdp: 'x' } }) as never, { params: Promise.resolve({ sessionId: String(session.id) }) })
    expect(postRes.status).toBe(403)

    const getRes = await signalGet(getReq(`http://localhost/api/telemedicine/${session.id}/signal?for=patient`) as never, { params: Promise.resolve({ sessionId: String(session.id) }) })
    expect(getRes.status).toBe(403)
  })

  it('an admin session succeeds regardless of name match, on the same non-matching-provider session', async () => {
    const otherProviderId = 2
    const session = await makeSession(otherProviderId)
    sessionRole = 'admin'
    sessionName = 'Someone Else Entirely'

    const postRes = await signalPost(jsonReq({ signalType: 'offer', payload: { sdp: 'x' } }) as never, { params: Promise.resolve({ sessionId: String(session.id) }) })
    expect(postRes.status).toBe(201)

    const getRes = await signalGet(getReq(`http://localhost/api/telemedicine/${session.id}/signal?for=patient`) as never, { params: Promise.resolve({ sessionId: String(session.id) }) })
    expect(getRes.status).toBe(200)
  })
})

describe('POST /api/telemedicine/[sessionId]/end ownership', () => {
  it('a matching pi succeeds', async () => {
    const session = await makeSession(MATCHING_PROVIDER_ID)
    sessionRole = 'pi'
    sessionName = 'Dr. Chen'

    const res = await endPost(jsonReq({}) as never, { params: Promise.resolve({ sessionId: String(session.id) }) })
    expect(res.status).toBe(200)
  })

  it('a non-matching pi gets 403', async () => {
    const session = await makeSession(2)
    sessionRole = 'pi'
    sessionName = 'Dr. Chen'

    const res = await endPost(jsonReq({}) as never, { params: Promise.resolve({ sessionId: String(session.id) }) })
    expect(res.status).toBe(403)
  })

  it('an admin always succeeds', async () => {
    const session = await makeSession(2)
    sessionRole = 'admin'
    sessionName = 'Someone Else Entirely'

    const res = await endPost(jsonReq({}) as never, { params: Promise.resolve({ sessionId: String(session.id) }) })
    expect(res.status).toBe(200)
  })
})

describe('cross-session signal isolation (Review Focus #4)', () => {
  it('signals posted to session A never appear in session B\'s results, and vice versa', async () => {
    sessionRole = 'admin'
    sessionName = 'Admin User'
    const sessionA = await makeSession(MATCHING_PROVIDER_ID)
    const sessionB = await makeSession(2)

    const postA = await signalPost(jsonReq({ signalType: 'offer', payload: { marker: 'A' } }) as never, { params: Promise.resolve({ sessionId: String(sessionA.id) }) })
    expect(postA.status).toBe(201)
    const postB = await signalPost(jsonReq({ signalType: 'offer', payload: { marker: 'B' } }) as never, { params: Promise.resolve({ sessionId: String(sessionB.id) }) })
    expect(postB.status).toBe(201)

    const signalsA = await listSignalsSince(sessionA.id, 0, 'provider')
    const signalsB = await listSignalsSince(sessionB.id, 0, 'provider')

    expect(signalsA).toHaveLength(1)
    expect(signalsA[0].payload).toEqual({ marker: 'A' })
    expect(signalsB).toHaveLength(1)
    expect(signalsB[0].payload).toEqual({ marker: 'B' })

    // Neither session's signal ids ever cross into the other's result set.
    const idsA = signalsA.map((s) => s.id)
    const idsB = signalsB.map((s) => s.id)
    expect(idsA.some((id) => idsB.includes(id))).toBe(false)
  })
})

describe('POST /api/appointments/[id]/telemedicine', () => {
  it('rejects a second call for the same appointment with 409 (Review Focus #5)', async () => {
    sessionRole = 'admin'
    sessionName = 'Admin User'
    const appt = await makeAppointment(MATCHING_PROVIDER_ID)

    const first = await createSessionRoute(jsonReq({}) as never, { params: Promise.resolve({ id: String(appt.id) }) })
    expect(first.status).toBe(201)

    const second = await createSessionRoute(jsonReq({}) as never, { params: Promise.resolve({ id: String(appt.id) }) })
    expect(second.status).toBe(409)
  })
})
