import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST as signalPost, GET as signalGet } from '@/app/api/telemedicine/[sessionId]/signal/route'
import { POST as declinePost } from '@/app/api/front-desk/assignments/[id]/decline/route'
import { getDb } from '@/db/client'
import { patients, appointments, telemedicineSessions, telemedicineSignals, doctorAssignments } from '@/db/schema'
import { createTelemedicineSession } from '@/lib/queries/telemedicine-sessions'

// Real seeded provider ids (see src/db/seed.ts PROVIDER_ROSTER) -- reused
// here under mocked names distinct from their real seeded names, same
// pattern as tests/api/telemedicine-signal.test.ts's MATCHING_PROVIDER_ID.
const LEESON_ID = 1 // real seeded provider id (Dr. Rajiv Kunam), mocked below as "Dr. Bill Leeson"
const LEE_ID = 2 // real seeded provider id (Dr. Elena Bosch), mocked below as "Dr. Ann Lee"

let sessionRole: 'admin' | 'pi' | 'crc' | 'frontdesk' = 'pi'
let sessionName = 'Dr. Bill Leeson'
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: sessionRole, name: sessionName })) }))

// Roster order is the point: Leeson sorts first, so `.find()` resolves any
// name whose trailing word is a substring of "Leeson" -- including "Lee" --
// to Leeson's id before it ever reaches Ann Lee's own entry.
vi.mock('@/lib/queries/providers', () => ({
  listActiveProviders: vi.fn(async () => [
    { id: LEESON_ID, name: 'Dr. Bill Leeson', credentials: null, specialty: 'Psychiatry', colorTag: 'chart-1', isActive: true },
    { id: LEE_ID, name: 'Dr. Ann Lee', credentials: null, specialty: 'Psychiatry', colorTag: 'chart-2', isActive: true },
  ]),
}))

const createdAppointmentIds: number[] = []
const createdAssignmentIds: number[] = []
afterEach(async () => {
  sessionRole = 'pi'
  sessionName = 'Dr. Bill Leeson'
  while (createdAssignmentIds.length > 0) {
    const id = createdAssignmentIds.pop()!
    await getDb().delete(doctorAssignments).where(eq(doctorAssignments.id, id))
  }
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

// Selects only `id` (not the full row) -- the live shared Neon DB used by
// every worktree currently lags src/db/schema.ts's intakeq/tebra-prefixed
// patients columns (known, non-blocking drift documented in Task 1/6's
// reports), and a bare `.select()` pulls every declared column. Only `id` is
// needed here, and that column is unaffected by the drift.
async function makeLeesonSession() {
  const db = getDb()
  const [patientRow] = await db.select({ id: patients.id }).from(patients).limit(1)
  const [appt] = await db.insert(appointments).values({
    patientId: patientRow.id, providerId: LEESON_ID,
    startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 60000), visitReason: 'Telemedicine ownership test',
  }).returning()
  createdAppointmentIds.push(appt.id)
  const { session } = await createTelemedicineSession(appt.id)
  return session!.id
}

async function makeLeesonAssignment() {
  const db = getDb()
  const [patientRow] = await db.select({ id: patients.id }).from(patients).limit(1)
  const [assignment] = await db.insert(doctorAssignments).values({
    patientId: patientRow.id, providerId: LEESON_ID,
    visitType: 'outpatient', urgency: 'routine', reason: 'Ownership collision test',
    assignedByName: 'Front Desk Test',
  }).returning()
  createdAssignmentIds.push(assignment.id)
  return assignment.id
}

function req(body: unknown) {
  return new Request('http://localhost', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}

function getReq(url: string) {
  return new Request(url, { method: 'GET' })
}

function ctx(sessionId: number) {
  return { params: Promise.resolve({ sessionId: String(sessionId) }) }
}

// EXPECTED RED. Spec §5/§9.3: `session.name.split(/\s+/).pop()` -> a
// `.includes()` substring match resolved with `.find()` means a pi named
// "Dr. Ann Lee" resolves to "Dr. Bill Leeson" whenever Leeson sorts first, and
// so passes the ownership check on Leeson's live patient video visit. The fix
// is a real session->provider foreign key, owned by the prescriptions plan
// (docs/superpowers/specs/.../prescriptions). `it.fails` keeps this branch's
// suite green while pinning the bug; when that FK lands, drop `.fails` and
// this becomes an ordinary regression test.
describe('telemedicine/assignments fuzzy provider-name collision (Dr. Ann Lee vs Dr. Bill Leeson)', () => {
  it.fails('denies Dr. Ann Lee the signalling channel of Dr. Bill Leeson\'s session', async () => {
    const leesonSessionId = await makeLeesonSession()
    sessionRole = 'pi'
    sessionName = 'Dr. Ann Lee'

    const res = await signalPost(req({ signalType: 'offer', payload: { sdp: 'x' } }) as never, ctx(leesonSessionId))
    expect(res.status).toBe(403)
  })

  it.fails('denies Dr. Ann Lee the signal GET on that session', async () => {
    const leesonSessionId = await makeLeesonSession()
    sessionRole = 'pi'
    sessionName = 'Dr. Ann Lee'

    const res = await signalGet(getReq(`http://localhost/api/telemedicine/${leesonSessionId}/signal?for=patient`) as never, ctx(leesonSessionId))
    expect(res.status).toBe(403)
  })

  it('still allows Dr. Bill Leeson on his own session', async () => {
    const leesonSessionId = await makeLeesonSession()
    sessionRole = 'pi'
    sessionName = 'Dr. Bill Leeson'

    // Passes today; pins that the eventual fix must not over-correct into
    // locking the real owner out (spec §5's under-exposure half).
    const res = await signalPost(req({ signalType: 'offer', payload: { sdp: 'x' } }) as never, ctx(leesonSessionId))
    expect(res.status).toBe(201)
  })

  it.fails('denies Dr. Ann Lee declining an assignment owned by Dr. Bill Leeson', async () => {
    const assignmentId = await makeLeesonAssignment()
    sessionRole = 'pi'
    sessionName = 'Dr. Ann Lee'

    const res = await declinePost(req({ reason: 'Not my patient' }) as never, { params: Promise.resolve({ id: String(assignmentId) }) })
    expect(res.status).toBe(403)
  })
})
