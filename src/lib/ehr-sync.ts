import { getDb } from '@/db/client'
import { patients, identityMatches, diagnoses, medicationEpisodes } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getEhrConnectors, requireEhrConnectors } from '@/connectors'
import type { FHIRPatient } from '@/connectors/types'
import { invalidateCache, patientDetailCacheKey, patientListCacheKey } from '@/lib/cache'

function unwrapRef(ref: string): string {
  const match = ref.match(/^ENC\[(.+)\]$/)
  return match ? match[1] : ref
}

const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** Exact (normalised) name + DOB match -- the same rule the mock's searchPatient() applies. */
function findTebraCandidates(tebraPatients: FHIRPatient[], fullName: string, dob: string): FHIRPatient[] {
  if (!dob) return []
  const wanted = normName(fullName)
  return tebraPatients.filter((p) => p.birthDate === dob && normName(`${p.firstName} ${p.lastName}`) === wanted)
}

async function nextAnonId(): Promise<string> {
  // Some legacy/imported charts carry non-numeric RD- ids (e.g.
  // 'RD-FHIR-CCDA-EMPTY') -- those must be excluded from the max computation,
  // not just parsed loosely, or a stray one poisons every id generated after
  // it with NaN.
  const existing = await getDb().select({ id: patients.id }).from(patients)
  const numericIds = existing
    .map((p) => p.id.match(/^RD-(\d+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => parseInt(m[1], 10))
  const nextNum = numericIds.length === 0 ? 1 : Math.max(...numericIds) + 1
  return `RD-${String(nextNum).padStart(4, '0')}`
}

/**
 * Pulls every client IntakeQ has on file (new referrals and ones already
 * seen before) and reconciles against what's already in `patients`:
 *
 *  - IntakeQ client we've never seen, with no matching Tebra chart -> a
 *    genuinely new patient. Created directly from IntakeQ data alone.
 *  - IntakeQ client we've never seen, but Tebra has a demographic match ->
 *    likely the same person already has a clinical chart. Queued into the
 *    existing Identity Matching Queue for staff confirmation rather than
 *    auto-merged -- getting this wrong silently creates a duplicate chart
 *    or, worse, links two different people's records together.
 *  - Patient we already have, with a linked Tebra chart -> refreshes only
 *    the Tebra-sourced dual-sourced fields, diagnoses and medications.
 *    Never touches staff-owned fields (portal password, notes, PI
 *    recommendation, etc. -- see the schema comment on `patients`), the
 *    same invariant the per-patient "Refresh from source systems" button
 *    already promises.
 *
 * Connectors come from getEhrConnectors(): the real IntakeQ/Tebra clients
 * built from the credentials saved on Settings -> EHR Connections, or the
 * demo mocks only when EHR_USE_MOCKS=1 outside production. With either side
 * unconfigured this throws EhrNotConfiguredError ("EHR connections are not
 * configured") before touching the database.
 *
 * Tebra is listed ONCE per sync and matched/refreshed in memory: the real
 * SOAP API is throttled (>= 1s between calls), so a per-client search or
 * per-patient GetPatient would make a sync take minutes. Diagnoses and
 * medications are only replaced when the connector actually provides them
 * (tebra.supportsClinicalData) -- the real Tebra SOAP API does not, and
 * "replacing" with an empty list would wipe the chart.
 */
export async function syncFromEhrs(): Promise<{ newPatients: number; newMatches: number; refreshedPatients: number }> {
  const { intakeq, tebra } = await requireEhrConnectors()
  const db = getDb()
  let newPatients = 0
  let newMatches = 0
  let refreshedPatients = 0

  // Vendor calls are sequential, not parallel: both APIs are rate limited.
  const allClients = await intakeq.listClients()
  const tebraPatients = await tebra.listPatients()
  const tebraById = new Map(tebraPatients.map((p) => [p.tebraPatientId, p]))

  const [allPatients, pendingMatches] = await Promise.all([
    db.select().from(patients),
    db.select({ intakeqClientIdRef: identityMatches.intakeqClientIdRef }).from(identityMatches),
  ])

  const knownIntakeqRefs = new Set(allPatients.map((p) => unwrapRef(p.intakeqClientIdRef)))
  const queuedIntakeqRefs = new Set(pendingMatches.map((m) => unwrapRef(m.intakeqClientIdRef)))

  // New IntakeQ clients: either queue for identity match, or create outright.
  for (const client of allClients) {
    if (!client.clientId || knownIntakeqRefs.has(client.clientId) || queuedIntakeqRefs.has(client.clientId)) continue

    const candidates = findTebraCandidates(tebraPatients, `${client.firstName} ${client.lastName}`, client.dateOfBirth)
    if (candidates.length > 0) {
      const candidate = candidates[0]
      await db.insert(identityMatches).values({
        intakeqClientIdRef: `ENC[${client.clientId}]`,
        referralName: `${client.firstName} ${client.lastName}`,
        referralDob: client.dateOfBirth,
        candidateTebraPatientIdRef: `ENC[${candidate.tebraPatientId}]`,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateDob: candidate.birthDate,
        confidence: 95, // exact (normalised) name + DOB match
        status: 'pending',
      })
      newMatches++
      continue
    }

    const intake = await intakeq.getIntakeByClientId(client.clientId)
    const id = await nextAnonId()
    await db.insert(patients).values({
      id,
      intakeqClientIdRef: `ENC[${client.clientId}]`,
      nameIntakeq: `${client.firstName} ${client.lastName}`,
      name: `${client.firstName} ${client.lastName}`,
      dobIntakeq: client.dateOfBirth,
      dob: client.dateOfBirth,
      cityIntakeq: client.city,
      zipIntakeq: client.zip,
      phoneIntakeq: client.phone,
      emailIntakeq: client.email,
      referralType: intake?.referralType ?? null,
      availability: intake?.availability ?? null,
      commConsentSigned: intake?.consentSigned ?? false,
      commConsentPref: intake?.consentPreference ?? null,
      ratingScales: intake?.ratingScales ?? [],
    })
    knownIntakeqRefs.add(client.clientId)
    newPatients++
    await invalidateCache(patientListCacheKey(null))
  }

  // Existing patients with a linked Tebra chart: refresh clinical data.
  for (const patient of allPatients) {
    if (!patient.tebraPatientIdRef) continue
    const tebraId = unwrapRef(patient.tebraPatientIdRef)
    const tebraPatient = tebraById.get(tebraId)
    if (!tebraPatient) continue

    await db.update(patients).set({
      nameTebra: `${tebraPatient.firstName} ${tebraPatient.lastName}`,
      dobTebra: tebraPatient.birthDate,
      cityTebra: tebraPatient.city,
      zipTebra: tebraPatient.zip,
      emailTebra: tebraPatient.email,
      currentProvider: tebraPatient.generalPractitioner,
      chartDataAsOf: new Date(),
    }).where(eq(patients.id, patient.id))

    // Tebra is this app's sole source of diagnoses/medications (every seeded
    // row is source: 'tebra') -- safe to replace wholesale on each refresh
    // rather than trying to diff against what's already there. But ONLY when
    // the connector can actually provide them; otherwise leave them alone.
    if (tebra.supportsClinicalData) {
      const activeMeds = await tebra.getActiveMedications(tebraId)
      const inactiveMeds = await tebra.getInactiveMedications(tebraId)
      const conditions = await tebra.getConditions(tebraId)
      await db.delete(diagnoses).where(eq(diagnoses.patientId, patient.id))
      await db.delete(medicationEpisodes).where(eq(medicationEpisodes.patientId, patient.id))
      for (const c of conditions) {
        await db.insert(diagnoses).values({ patientId: patient.id, code: c.code, description: c.description, source: 'tebra', date: c.date })
      }
      for (const m of [...activeMeds, ...inactiveMeds]) {
        await db.insert(medicationEpisodes).values({ patientId: patient.id, name: m.name, medicationClass: m.medicationClass, dose: m.dose, startDate: m.startDate, stopDate: m.stopDate, status: m.status })
      }
    }

    refreshedPatients++
    await invalidateCache(patientDetailCacheKey(patient.id))
  }

  if (newPatients > 0 || refreshedPatients > 0) {
    await invalidateCache(patientListCacheKey(null))
  }

  return { newPatients, newMatches, refreshedPatients }
}

/**
 * Confirming a queued identity match previously only flipped its status --
 * it never actually created the patient record the whole point of matching
 * was to produce. This is the other half: pull both systems' data for the
 * confirmed pair and populate a real patient chart from it, same as
 * syncFromEhrs() would for an unambiguous match. Falls back to the match
 * row's own snapshot fields when a lookup misses (covers the hand-seeded
 * demo matches, which don't correspond to real records) or when that
 * vendor isn't configured. A vendor that IS configured but fails (auth,
 * network...) throws EhrConnectorError rather than silently producing a
 * half-populated chart.
 */
export async function confirmIdentityMatch(matchId: number): Promise<{ patientId: string } | null> {
  const db = getDb()
  const [match] = await db.select().from(identityMatches).where(eq(identityMatches.id, matchId))
  if (!match || match.status !== 'pending') return null

  // A match row can end up back at 'pending' after already being acted on
  // (e.g. a bug, a manual DB edit) -- re-confirming it must never create a
  // second chart for someone who already has one. Mark it confirmed and
  // point at the existing patient instead of inserting a duplicate.
  const [existingPatient] = await db.select({ id: patients.id }).from(patients).where(eq(patients.intakeqClientIdRef, match.intakeqClientIdRef))
  if (existingPatient) {
    await db.update(identityMatches).set({ status: 'confirmed' }).where(eq(identityMatches.id, matchId))
    return { patientId: existingPatient.id }
  }

  const intakeqId = unwrapRef(match.intakeqClientIdRef)
  const tebraId = unwrapRef(match.candidateTebraPatientIdRef)
  const { intakeq, tebra } = await getEhrConnectors()
  const client = intakeq ? await intakeq.getClient(intakeqId) : null
  const tebraPatient = tebra ? await tebra.getPatientById(tebraId) : null

  const id = await nextAnonId()
  await db.insert(patients).values({
    id,
    intakeqClientIdRef: match.intakeqClientIdRef,
    tebraPatientIdRef: match.candidateTebraPatientIdRef,
    nameIntakeq: client ? `${client.firstName} ${client.lastName}` : match.referralName,
    name: client ? `${client.firstName} ${client.lastName}` : match.referralName,
    dobIntakeq: client?.dateOfBirth ?? match.referralDob,
    dob: client?.dateOfBirth ?? match.referralDob,
    cityIntakeq: client?.city ?? null,
    zipIntakeq: client?.zip ?? null,
    phoneIntakeq: client?.phone ?? null,
    emailIntakeq: client?.email ?? null,
    nameTebra: tebraPatient ? `${tebraPatient.firstName} ${tebraPatient.lastName}` : match.candidateName,
    dobTebra: tebraPatient?.birthDate ?? match.candidateDob,
    cityTebra: tebraPatient?.city ?? null,
    zipTebra: tebraPatient?.zip ?? null,
    emailTebra: tebraPatient?.email ?? null,
    currentProvider: tebraPatient?.generalPractitioner ?? null,
  })

  if (tebra && tebraPatient && tebra.supportsClinicalData) {
    const activeMeds = await tebra.getActiveMedications(tebraId)
    const inactiveMeds = await tebra.getInactiveMedications(tebraId)
    const conditions = await tebra.getConditions(tebraId)
    for (const c of conditions) {
      await db.insert(diagnoses).values({ patientId: id, code: c.code, description: c.description, source: 'tebra', date: c.date })
    }
    for (const m of [...activeMeds, ...inactiveMeds]) {
      await db.insert(medicationEpisodes).values({ patientId: id, name: m.name, medicationClass: m.medicationClass, dose: m.dose, startDate: m.startDate, stopDate: m.stopDate, status: m.status })
    }
  }

  await db.update(identityMatches).set({ status: 'confirmed' }).where(eq(identityMatches.id, matchId))
  await invalidateCache(patientListCacheKey(null))

  return { patientId: id }
}
