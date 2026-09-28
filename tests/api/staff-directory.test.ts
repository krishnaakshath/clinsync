import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { GET as listRoute, POST as createRoute } from '@/app/api/staff/route'
import { GET as detailRoute } from '@/app/api/staff/[id]/route'
import { POST as addCredentialRoute } from '@/app/api/staff/[id]/credentials/route'
import { getDb } from '@/db/client'
import { staffMembers, staffCredentials } from '@/db/schema'

let sessionRole: 'admin' | 'pi' | 'crc' | 'frontdesk' = 'admin'
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: sessionRole, name: 'Dr. R. Kunam' })) }))

const createdStaffIds: number[] = []
afterEach(async () => {
  sessionRole = 'admin'
  while (createdStaffIds.length > 0) {
    const id = createdStaffIds.pop()!
    await getDb().delete(staffCredentials).where(eq(staffCredentials.staffMemberId, id))
    await getDb().delete(staffMembers).where(eq(staffMembers.id, id))
  }
})

function req(body: unknown) {
  return new Request('http://localhost', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}

function params(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) }
}

describe('GET /api/staff', () => {
  it.each(['admin', 'pi', 'crc', 'frontdesk'] as const)('succeeds (200) for role %s', async (role) => {
    sessionRole = role
    const res = await listRoute()
    expect(res.status).toBe(200)
  })
})

describe('POST /api/staff', () => {
  it('succeeds (201) as admin, with no userId/providerId in the body', async () => {
    sessionRole = 'admin'
    const res = await createRoute(req({ name: 'Route Test Staff A', department: 'Front Desk', title: 'Receptionist', hireDate: '2024-01-01' }) as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    createdStaffIds.push(body.id)
    expect(body.userId).toBeNull()
    expect(body.providerId).toBeNull()
  })

  it.each(['pi', 'crc', 'frontdesk'] as const)('returns 403 for role %s', async (role) => {
    sessionRole = role
    const res = await createRoute(req({ name: 'Route Test Staff B', department: 'Front Desk', title: 'Receptionist', hireDate: '2024-01-01' }) as never)
    expect(res.status).toBe(403)
  })

  it('returns 400 for a userId that does not exist', async () => {
    sessionRole = 'admin'
    const res = await createRoute(req({ userId: 999999, name: 'Route Test Staff C', department: 'Clinical', title: 'Nurse', hireDate: '2024-01-01' }) as never)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/staff/[id]', () => {
  it("returns the created staff member's detail including an empty credentials array", async () => {
    sessionRole = 'admin'
    const createRes = await createRoute(req({ name: 'Route Test Staff D', department: 'Clinical', title: 'Nurse', hireDate: '2024-01-01' }) as never)
    const created = await createRes.json()
    createdStaffIds.push(created.id)

    const res = await detailRoute(new Request('http://localhost') as never, params(created.id))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Route Test Staff D')
    expect(body.credentials).toEqual([])
  })

  it('returns 404 for a nonexistent id', async () => {
    sessionRole = 'admin'
    const res = await detailRoute(new Request('http://localhost') as never, params(999999))
    expect(res.status).toBe(404)
  })
})

describe('POST /api/staff/[id]/credentials', () => {
  it('succeeds (201) as admin', async () => {
    sessionRole = 'admin'
    const createRes = await createRoute(req({ name: 'Route Test Staff E', department: 'Clinical', title: 'Nurse', hireDate: '2024-01-01' }) as never)
    const created = await createRes.json()
    createdStaffIds.push(created.id)

    const res = await addCredentialRoute(req({ credentialType: 'DEA Registration', credentialNumber: 'X999', expiresOn: '2030-01-01' }) as never, params(created.id))
    expect(res.status).toBe(201)
  })

  it.each(['pi', 'crc', 'frontdesk'] as const)('returns 403 for role %s', async (role) => {
    sessionRole = 'admin'
    const createRes = await createRoute(req({ name: 'Route Test Staff F', department: 'Clinical', title: 'Nurse', hireDate: '2024-01-01' }) as never)
    const created = await createRes.json()
    createdStaffIds.push(created.id)

    sessionRole = role
    const res = await addCredentialRoute(req({ credentialType: 'DEA Registration' }) as never, params(created.id))
    expect(res.status).toBe(403)
  })
})
