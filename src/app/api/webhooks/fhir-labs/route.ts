import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { enterResult } from '@/lib/queries/lab-orders'
// In a real HIPAA-compliant integration, you would verify an API key,
// mutual TLS (mTLS), or OAuth 2.0 Client Credentials token from your LIS
// (Lab Information System) like Quest Diagnostics, LabCorp, or an interface engine (Redox).

const fhirObservationSchema = z.object({
  resourceType: z.literal('Observation'),
  status: z.string(),
  code: z.object({
    coding: z.array(z.object({
      system: z.string().optional(),
      code: z.string(),
      display: z.string().optional(),
    }))
  }),
  subject: z.object({
    reference: z.string() // e.g. "Patient/RD-0001"
  }),
  valueQuantity: z.object({
    value: z.number(),
    unit: z.string(),
  }).optional(),
  valueString: z.string().optional(),
  referenceRange: z.array(z.object({
    text: z.string()
  })).optional(),
  interpretation: z.array(z.object({
    coding: z.array(z.object({
      code: z.string() // e.g. "H" (High), "L" (Low), "N" (Normal)
    }))
  })).optional(),
  // For matching back to our internal order
  basedOn: z.array(z.object({
    reference: z.string() // e.g. "ServiceRequest/123"
  })).optional()
}).strict()

export async function POST(request: NextRequest) {
  // 1. HIPAA / Security check: verify incoming integration token
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.LIS_INTEGRATION_TOKEN || 'test-hl7-token'}`) {
    return NextResponse.json({ error: 'Unauthorized: Invalid LIS integration token' }, { status: 401 })
  }

  try {
    const payload = await request.json()
    const parsed = fhirObservationSchema.safeParse(payload)
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid FHIR Observation payload', details: parsed.error.flatten() }, { status: 400 })
    }

    const obs = parsed.data
    
    // Extract internal order ID
    const orderRef = obs.basedOn?.[0]?.reference
    if (!orderRef || !orderRef.startsWith('ServiceRequest/')) {
      return NextResponse.json({ error: 'Missing or invalid basedOn reference. Must be ServiceRequest/{id}' }, { status: 400 })
    }
    const orderId = parseInt(orderRef.split('/')[1], 10)

    // Parse FHIR interpretation to our internal flags
    const fhirFlag = obs.interpretation?.[0]?.coding?.[0]?.code
    let flag: 'normal' | 'abnormal' | 'critical' = 'normal'
    if (fhirFlag === 'H' || fhirFlag === 'L') flag = 'abnormal'
    if (fhirFlag === 'LL' || fhirFlag === 'HH' || fhirFlag === 'A' || fhirFlag === 'CR') flag = 'critical'

    // Extract value
    const value = obs.valueQuantity ? obs.valueQuantity.value.toString() : (obs.valueString || '')
    const unit = obs.valueQuantity?.unit
    const referenceRange = obs.referenceRange?.[0]?.text

    // 2. Automatically enter the result in our database
    const result = await enterResult(orderId, {
      value,
      unit,
      referenceRange,
      flag,
      notes: 'Received electronically via FHIR LIS interface',
      resultedByName: 'System (LIS API)',
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }

    // Since this is a background system task, we don't have a user session for audit log.
    // In a real system, you'd log this with a system-level identity or the API token's identity.
    // await logAudit(systemSession, 'electronic lab result processed via FHIR', result.patientId)

    return NextResponse.json({ ok: true, message: 'Electronic lab result processed successfully' })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error processing lab result' }, { status: 500 })
  }
}
