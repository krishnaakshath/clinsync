import { requireSessionOrRedirect } from '@/lib/auth'
import { logAudit } from '@/lib/audit'
import { listFormTemplates } from '@/lib/queries/form-templates'
import { FormTemplateCard } from '@/components/FormTemplateCard'
import { CreateFormButton } from '@/components/CreateFormButton'

export default async function FormsPage() {
  const session = await requireSessionOrRedirect()
  const templates = await listFormTemplates()
  await logAudit(session, 'viewed form templates', null)

  const categories = [...new Set(templates.map((t) => t.category))].sort()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Form Templates</h1>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No form templates yet.</p>
      ) : (
        <div className="space-y-8">
          {categories.map((category) => (
            <section key={category}>
              <h2 className="mb-3 border-l-2 border-primary/40 pl-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</h2>
              <div className="grid grid-cols-3 gap-4">
                {templates.filter((t) => t.category === category).map((t) => <FormTemplateCard key={t.id} template={t} />)}
                <CreateFormButton category={category} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
