import Link from 'next/link'

export function FormTemplateCard({ template }: { template: { id: number; name: string; diagnosisTag: string; questions: unknown[]; isActive: boolean } }) {
  return (
    <Link href={`/forms/${template.id}`} className="block rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-foreground">{template.name}</span>
        {!template.isActive && <span className="text-xs font-medium text-muted-foreground">Inactive</span>}
      </div>
      <p className="text-sm text-muted-foreground">{template.diagnosisTag}</p>
      <p className="mt-2 text-xs text-muted-foreground">{template.questions.length} question{template.questions.length === 1 ? '' : 's'}</p>
    </Link>
  )
}
