import type { medicationEpisodes } from '@/db/schema'
import type { FhirReference } from './types'

export interface FhirMedicationRequest {
  resourceType: 'MedicationRequest'
  id: string
  status: 'active'
  subject: FhirReference
  medicationCodeableConcept: { text: string }
  dosageInstruction?: { text: string }[]
  authoredOn: string
}

// Only `status === 'active'` episodes produce a resource -- spec §3 says
// "one resource per active episode." A stopped episode returns `null`.
export function medicationEpisodeToFhir(episode: typeof medicationEpisodes.$inferSelect): FhirMedicationRequest | null {
  if (episode.status !== 'active') return null
  return {
    resourceType: 'MedicationRequest',
    id: `medication-request-${episode.id}`,
    status: 'active',
    subject: { reference: `Patient/${episode.patientId}` },
    // No `coding` -- this app has no RxNorm data for medication episodes.
    medicationCodeableConcept: { text: `${episode.name} (${episode.medicationClass})` },
    ...(episode.dose ? { dosageInstruction: [{ text: episode.dose }] } : {}),
    authoredOn: episode.startDate,
  }
}

export function medicationEpisodesToFhir(rows: (typeof medicationEpisodes.$inferSelect)[]): FhirMedicationRequest[] {
  return rows.map(medicationEpisodeToFhir).filter((r): r is FhirMedicationRequest => r !== null)
}
