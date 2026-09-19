import { getDb } from '@/db/client'
import { patients, identityMatches, diagnoses, medicationEpisodes } from '@/db/schema'
import { eq } from 'drizzle-orm'
import * as intakeq from '@/connectors/intakeq.mock'
import * as tebra from '@/connectors/tebra.mock'
import { invalidateCache, patientDetailCacheKey, patientListCacheKey } from '@/lib/cache'

function unwrapRef(ref: string): string {
  const match = ref.match(/^ENC\[(.+)\]$/)
  return match ? match[1] : ref
}

async function nextAnonId(): Promise<string> {
  const existing = await getDb().select({ id: patients.id }).from(patients)
  const nextNum = existing.length === 0 ? 1 : Math.max(...existing.map((p) => parseInt(p.id.replace('RD-', ''), 10))) + 1
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
 * No real IntakeQ/Tebra credentials exist yet (see EhrConnectionsForm) --
 * this runs against the project's mock connectors, but the reconciliation
 * logic itself is real and is what a live integration would plug into.
 */
export async function syncFromEhrs(): Promise<{ newPatients: number; newMatches: number; refreshedPatients: number }> {
  const db = getDb()
  let newPatients = 0
  let newMatches = 0
  let refreshedPatients = 0

  const [allPatients, allClients, pendingMatches] = await Promise.all([
    db.select().from(patients),
    intakeq.listClients(),
    db.select({ intakeqClientIdRef: identityMatches.intakeqClientIdRef }).from(identityMatches),
  ])

  const knownIntakeqRefs = new Set(allPatients.map((p) => unwrapRef(p.intakeqClientIdRef)))
  const queuedIntakeqRefs = new Set(pendingMatches.map((m) => unwrapRef(m.intakeqClientIdRef)))

  // New IntakeQ clients: either queue for identity match, or create outright.
  for (const client of allClients) {
    if (knownIntakeqRefs.has(client.clientId) || queuedIntakeqRefs.has(client.clientId)) continue

    const candidates = await tebra.searchPatient(`${client.firstName} ${client.lastName}`, client.dateOfBirth)
    if (candidates.length > 0) {
      const candidate = candidates[0]
      await db.insert(identityMatches).values({
        intakeqClientIdRef: `ENC[${client.clientId}]`,
        referralName: `${client.firstName} ${client.lastName}`,
        referralDob: client.dateOfBirth,
        candidateTebraPatientIdRef: `ENC[${candidate.tebraPatientId}]`,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        candidateDob: candidate.birthDate,
        confidence: 95, // mock connector only returns exact name+DOB matches
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
      dobIntakeq: client.dateOfBirth,
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
    const tebraPatient = await tebra.getPatientById(tebraId)
    if (!tebraPatient) continue

    const [activeMeds, inactiveMeds, conditions] = await Promise.all([
      tebra.getActiveMedications(tebraId),
      tebra.getInactiveMedications(tebraId),
      tebra.getConditions(tebraId),
    ])

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
    // rather than trying to diff against what's already there.
    await db.delete(diagnoses).where(eq(diagnoses.patientId, patient.id))
    await db.delete(medicationEpisodes).where(eq(medicationEpisodes.patientId, patient.id))
    for (const c of conditions) {
      await db.insert(diagnoses).values({ patientId: patient.id, code: c.code, description: c.description, source: 'tebra', date: c.date })
    }
    for (const m of [...activeMeds, ...inactiveMeds]) {
      await db.insert(medicationEpisodes).values({ patientId: patient.id, name: m.name, medicationClass: m.medicationClass, dose: m.dose, startDate: m.startDate, stopDate: m.stopDate, status: m.status })
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
 * row's own snapshot fields when a mock lookup misses (covers the
 * hand-seeded demo matches, which don't correspond to real mock records).
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
  const [client, tebraPatient] = await Promise.all([intakeq.getClient(intakeqId), tebra.getPatientById(tebraId)])

  const id = await nextAnonId()
  await db.insert(patients).values({
    id,
    intakeqClientIdRef: match.intakeqClientIdRef,
    tebraPatientIdRef: match.candidateTebraPatientIdRef,
    nameIntakeq: client ? `${client.firstName} ${client.lastName}` : match.referralName,
    dobIntakeq: client?.dateOfBirth ?? match.referralDob,
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

  if (tebraPatient) {
    const [activeMeds, inactiveMeds, conditions] = await Promise.all([
      tebra.getActiveMedications(tebraId),
      tebra.getInactiveMedications(tebraId),
      tebra.getConditions(tebraId),
    ])
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
