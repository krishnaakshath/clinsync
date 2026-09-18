import { requireSessionOrRedirect } from '@/lib/auth'
import { listAuditLog } from '@/lib/queries/audit-log'

export default async function AuditLogPage() {
  // Must be the first statement — see the comment in patients/page.tsx.
  await requireSessionOrRedirect()
  const entries = await listAuditLog()
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-foreground">Audit Log</h1>
      <div className="rounded-xl border border-primary/10 bg-card/80 p-5 shadow-sm backdrop-blur-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left"><th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time</th><th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">User</th><th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Role</th><th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</th><th className="p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</th></tr></thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.id} className={`border-b border-border transition-colors hover:bg-primary/5 ${i % 2 === 1 ? 'bg-muted/40' : ''}`}>
                <td className="p-3 font-mono text-xs text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</td>
                <td className="p-3 text-foreground">{e.userName}</td>
                <td className="p-3 text-foreground">{e.role}</td>
                <td className="p-3 text-foreground">{e.action}</td>
                <td className="p-3 font-mono text-xs text-muted-foreground">{e.patientId ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <p className="p-3 text-sm text-muted-foreground">No audit entries found.</p>}
      </div>
    </div>
  )
}
