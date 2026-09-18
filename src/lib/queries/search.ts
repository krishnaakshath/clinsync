import { listPatientsWithStatus } from '@/lib/queries/patients'
import { listAllTrials } from '@/lib/queries/trials'
import { listFormTemplates } from '@/lib/queries/form-templates'

export interface SearchResult {
  id: string
  label: string
  detail: string
  href: string
}

export interface SearchResults {
  patients: SearchResult[]
  trials: SearchResult[]
  formTemplates: SearchResult[]
}

const MAX_RESULTS_PER_CATEGORY = 8

// The global search bar in TopBanner -- one query fanned out across every
// entity a staff member might be looking for by name. Runs entirely against
// each entity's own already-cached list query (never raw SQL LIKE clauses)
// and filters in memory, matching the architecture's standing guidance that
// Clinsync's real data scale (dozens of records per entity, not millions)
// doesn't warrant server-side search infrastructure.
export async function searchAll(rawQuery: string): Promise<SearchResults> {
  const q = rawQuery.trim().toLowerCase()
  if (q.length === 0) return { patients: [], trials: [], formTemplates: [] }

  const [allPatients, allTrials, allFormTemplates] = await Promise.all([
    listPatientsWithStatus(null),
    listAllTrials(),
    listFormTemplates(),
  ])

  const patients: SearchResult[] = allPatients
    .filter((p) => {
      const name = (p.nameTebra ?? p.nameIntakeq).toLowerCase()
      return name.includes(q) || p.id.toLowerCase().includes(q)
    })
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((p) => ({ id: p.id, label: p.nameTebra ?? p.nameIntakeq, detail: p.id, href: `/patients/${p.id}` }))

  const trials: SearchResult[] = allTrials
    .filter((t) => t.name.toLowerCase().includes(q) || t.condition.toLowerCase().includes(q) || t.nctNumber.toLowerCase().includes(q))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((t) => ({ id: t.id, label: t.name, detail: t.condition, href: `/trials/${t.id}` }))

  const formTemplates: SearchResult[] = allFormTemplates
    .filter((f) => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q))
    .slice(0, MAX_RESULTS_PER_CATEGORY)
    .map((f) => ({ id: String(f.id), label: f.name, detail: f.category, href: `/forms/${f.id}` }))

  return { patients, trials, formTemplates }
}
