import { describe, it, expect, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { GET } from '@/app/api/patients/[anonId]/insurance-card/[side]/route'
import { getDb } from '@/db/client'
import { patients } from '@/db/schema'

let sessionRole: 'admin' | 'pi' | 'crc' | 'frontdesk' = 'frontdesk'
vi.mock('@/lib/auth', () => ({ requireSession: vi.fn(async () => ({ role: sessionRole, name: 'Taylor Nguyen' })) }))

// The blob store is private -- this route streams the bytes itself via
// @vercel/blob's get() rather than letting the browser hit a stored URL
// directly. Mocked the same way as documents-download.test.ts.
vi.mock('@vercel/blob', () => ({
  get: vi.fn(async (urlOrPathname: string) => ({
    statusCode: 200 as const,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('fake-card-bytes'))
        controller.close()
      },
    }),
    headers: new Headers(),
    blob: {
      url: urlOrPathname,
      downloadUrl: urlOrPathname,
      pathname: urlOrPathname,
      contentDisposition: '',
      cacheControl: '',
      uploadedAt: new Date(),
      etag: 'test-etag',
      contentType: 'image/jpeg',
      size: 15,
    },
  })),
}))

afterEach(async () => {
  sessionRole = 'frontdesk'
  const [patientRow] = await getDb().select().from(patients).limit(1)
  await getDb().update(patients).set({ primaryCardFrontUrl: null, primaryCardBackUrl: null }).where(eq(patients.id, patientRow.id))
})

function imageReq() {
  return new Request('http://localhost/api/patients/x/insurance-card/front')
}

describe('GET /api/patients/[anonId]/insurance-card/[side]', () => {
  it('streams the stored front-card image bytes', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)
    await getDb().update(patients).set({ primaryCardFrontUrl: 'https://blob.test/insurance-cards/stored-front' }).where(eq(patients.id, patientRow.id))

    const res = await GET(imageReq() as never, { params: Promise.resolve({ anonId: patientRow.id, side: 'front' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(await res.text()).toBe('fake-card-bytes')
  })

  it('returns 404 when no card is stored for that side', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)

    const res = await GET(imageReq() as never, { params: Promise.resolve({ anonId: patientRow.id, side: 'back' }) })
    expect(res.status).toBe(404)
  })

  it('rejects an invalid side segment', async () => {
    const [patientRow] = await getDb().select().from(patients).limit(1)

    const res = await GET(imageReq() as never, { params: Promise.resolve({ anonId: patientRow.id, side: 'sideways' }) })
    expect(res.status).toBe(400)
  })
})
