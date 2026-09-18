import { getDb } from '@/db/client'
import { patients, diagnoses, medicationEpisodes } from '@/db/schema'
import { getOrSetCache, workbookListCacheKey } from '@/lib/cache'

// One row per patient, covering all 30 columns of the source IPMG
// pre-screening workbook (Symbiosys_IPMG_Prescreening_Proposal.pdf) --
// distinct from the Patient Detail page (one patient, screening-focused)
// and from the "Verification Workbook" export (a nurse's call-prep sheet
// with only the fields relevant to confirming identity on a call). This is
// the literal 30-heading grid, and its Excel export (buildFullWorkbookXlsx)
// must render exactly these same fields in the same order so the in-app
// view and the download always agree.
export interface WorkbookRow {
  id: string // 1. Anonymous Number
  dateAdded: string // 2. Date Added to Tab
  patientName: string // 3. Patient Name
  currentProvider: string | null // 4. Current Provider
  ratingScales: string // 5. Rating Scales
  dob: string // 6. DOB
  age: number // 7. Age (derived from DOB, never stored)
  city: string | null // 8. City
  zip: string | null // 9. Zip
  phone: string | null // 10. Phone
  dxCodes: string // 11. Dx Codes
  lastCommunication: string | null // 12. Last Communication
  referralType: string | null // 13. Referral Type
  availability: string | null // 14. Availability
  apptDates: string // 15. Past & Future Appt Date
  commConsent: string // 16. Comm Consent Signed/Pref/IntakeQ
  formNotes: string | null // 17. Form Notes
  reviewerNotes: string | null // 18. Reviewer Notes
  clinicianReviewerNotes: string | null // 19. Clinician Reviewer Notes
  piRecommendation: string | null // 20. Dr. Kunam's Recommendation
  activeMeds: string // 21. Active Meds
  inactiveMeds: string // 22. Inactive Meds
  oldNotes: string | null // 23. old notes extra space
  oldRecs: string | null // 24. old recs extra space
  tebraChartUrl: string | null // 25. LINK TEBRA
  intakeqEmail: string | null // 26. IntakeQ Email
  patientEmail: string | null // 27. pt email
  outsideMedsConfirmation: string | null // 28. Meds List from pharmacy extra confirmation
  templateDocUrl: string | null // 29. Template Word Doc in SharePoint
  prescreeningSentDate: string | null // 30. Research Depression Prescreening Sent Date
}

export function calculateAge(dob: string): number {
  const birth = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--
  return age
}

export async function listWorkbookRows(): Promise<WorkbookRow[]> {
  return getOrSetCache(workbookListCacheKey(), 30, async () => {
    const db = getDb()
    const allPatients = await db.select().from(patients).orderBy(patients.id)
    const allDx = await db.select().from(diagnoses)
    const allMeds = await db.select().from(medicationEpisodes)

    return allPatients.map((p): WorkbookRow => {
      const dx = allDx.filter((d) => d.patientId === p.id)
      const meds = allMeds.filter((m) => m.patientId === p.id)
      const dob = p.dobTebra ?? p.dobIntakeq

      return {
        id: p.id,
        dateAdded: p.dateAdded.toISOString().slice(0, 10),
        patientName: p.nameTebra ?? p.nameIntakeq,
        currentProvider: p.currentProvider,
        ratingScales: (p.ratingScales ?? []).map((r) => `${r.name}: ${r.score} (${r.date})`).join('; '),
        dob,
        age: calculateAge(dob),
        city: p.cityTebra ?? p.cityIntakeq,
        zip: p.zipTebra ?? p.zipIntakeq,
        phone: p.phoneTebra ?? p.phoneIntakeq,
        dxCodes: dx.map((d) => `${d.code}: ${d.description}`).join('; '),
        lastCommunication: p.lastCommunication,
        referralType: p.referralType,
        availability: p.availability,
        apptDates: [p.lastApptDate ? `Past: ${p.lastApptDate}` : null, p.nextApptDate ? `Next: ${p.nextApptDate}` : null].filter(Boolean).join(' / '),
        commConsent: `${p.commConsentSigned ? 'Signed' : 'Not signed'}${p.commConsentPref ? ` (${p.commConsentPref})` : ''}`,
        formNotes: p.formNotes,
        reviewerNotes: p.reviewerNotes,
        clinicianReviewerNotes: p.clinicianReviewerNotes,
        piRecommendation: p.piRecommendation,
        activeMeds: meds.filter((m) => m.status === 'active').map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''}`).join('; '),
        inactiveMeds: meds.filter((m) => m.status === 'inactive').map((m) => `${m.name}${m.dose ? ` ${m.dose}` : ''}`).join('; '),
        oldNotes: p.oldNotes,
        oldRecs: p.oldRecs,
        tebraChartUrl: p.tebraChartUrl,
        intakeqEmail: p.emailIntakeq,
        patientEmail: p.emailTebra,
        outsideMedsConfirmation: p.outsideMedsConfirmation,
        templateDocUrl: p.templateDocUrl,
        prescreeningSentDate: p.prescreeningSentDate,
      }
    })
  })
}
