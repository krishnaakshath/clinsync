import type { PatientFhirData } from '@/lib/fhir/gather'
import { patientToFhir } from '@/lib/fhir/patient'
import { allergiesToFhir, type FhirAllergyIntolerance } from '@/lib/fhir/allergy'
import { conditionsToFhir, type FhirCondition } from '@/lib/fhir/condition'
import { medicationEpisodesToFhir, type FhirMedicationRequest } from '@/lib/fhir/medication-request'
import { observationsToFhir, type FhirObservation } from '@/lib/fhir/observation'

// MedicationDispense is intentionally not composed into any CCD section here.
// Spec §4 names exactly four CCD sections for this plan -- Allergies,
// Medications, Problems, Results -- and there is no standard CCD section
// counterpart for dispense history in that fixed scope. Dispense history
// stays FHIR-only (see src/lib/fhir/bundle.ts, which does include it); this
// is a deliberate scope boundary, not an oversight.

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function allergyEntry(a: FhirAllergyIntolerance): string {
  const reaction = a.reaction[0]
  return `      <entry>
        <allergen>${escapeXml(a.code.text ?? '')}</allergen>
        <reaction>${escapeXml(reaction?.manifestation[0]?.text ?? '')}</reaction>
        <severity>${escapeXml(reaction?.severity ?? '')}</severity>
      </entry>`
}

function conditionEntry(c: FhirCondition): string {
  const code = c.code.coding?.[0]?.code ?? ''
  return `      <entry>
        <problemName>${escapeXml(c.code.text ?? '')}</problemName>
        <code>${escapeXml(code)}</code>
        <recordedDate>${escapeXml(c.recordedDate ?? '')}</recordedDate>
      </entry>`
}

function medicationEntry(m: FhirMedicationRequest): string {
  const dosage = m.dosageInstruction?.[0]?.text ?? ''
  return `      <entry>
        <medicationName>${escapeXml(m.medicationCodeableConcept.text)}</medicationName>
        <dosage>${escapeXml(dosage)}</dosage>
        <status>${escapeXml(m.status)}</status>
        <authoredOn>${escapeXml(m.authoredOn)}</authoredOn>
      </entry>`
}

function observationEntry(o: FhirObservation): string {
  const value = o.valueQuantity ? `${o.valueQuantity.value} ${o.valueQuantity.unit}`.trim() : (o.valueString ?? '')
  return `      <entry>
        <testName>${escapeXml(o.code.text ?? '')}</testName>
        <value>${escapeXml(value)}</value>
        <effectiveDateTime>${escapeXml(o.effectiveDateTime)}</effectiveDateTime>
      </entry>`
}

function section(title: string, templateId: string, entriesXml: string[]): string {
  return `    <section>
      <templateId root="${templateId}"/>
      <title>${escapeXml(title)}</title>
${entriesXml.length > 0 ? entriesXml.join('\n') : '      <entry/>'}
    </section>`
}

// A CCD-shaped document, not one validated against the real HL7 CCD XSD
// (spec §4 asks for "the CCD template structure," not schema conformance).
// Every field this function writes into the document is read directly off
// the Task 1 FHIR mapping functions' output (patientToFhir, allergiesToFhir,
// conditionsToFhir, medicationEpisodesToFhir, observationsToFhir) rather than
// re-derived from the raw DB rows a second time -- that's what makes this
// document provably consistent with the FHIR Bundle for the same patient:
// there is exactly one place each fact is computed.
export function toCcdaXml(data: PatientFhirData): string {
  const patient = patientToFhir(data.patient)
  const allergies = allergiesToFhir(data.allergyRows)
  const conditions = conditionsToFhir(data.diagnosisRows)
  const medicationRequests = medicationEpisodesToFhir(data.medicationEpisodeRows)
  const observations = observationsToFhir(data.patient.id, data.labOrderRows)

  const now = new Date().toISOString()
  const patientName = patient.name[0]?.text ?? ''

  const sections = [
    section('Allergies', '2.16.840.1.113883.10.20.22.2.6.1', allergies.map(allergyEntry)),
    section('Medications', '2.16.840.1.113883.10.20.22.2.1.1', medicationRequests.map(medicationEntry)),
    section('Problems', '2.16.840.1.113883.10.20.22.2.5.1', conditions.map(conditionEntry)),
    section('Results', '2.16.840.1.113883.10.20.22.2.3.1', observations.map(observationEntry)),
  ]

  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <typeId root="2.16.840.1.113883.1.3" extension="POCD_HD000040"/>
  <templateId root="2.16.840.1.113883.10.20.22.1.1"/>
  <title>Continuity of Care Document</title>
  <effectiveTime value="${escapeXml(now)}"/>
  <recordTarget>
    <patientRole>
      <id extension="${escapeXml(patient.id)}"/>
      <patient>
        <name>${escapeXml(patientName)}</name>
        <birthTime value="${escapeXml(patient.birthDate)}"/>
      </patient>
    </patientRole>
  </recordTarget>
  <component>
    <structuredBody>
${sections.map((s) => `      <component>\n${s}\n      </component>`).join('\n')}
    </structuredBody>
  </component>
</ClinicalDocument>
`
}
