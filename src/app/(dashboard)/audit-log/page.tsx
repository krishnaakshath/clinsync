import { listAuditLog } from '@/lib/queries/audit-log'

export default async function AuditLogPage() {
  const entries = await listAuditLog()
  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold">Audit Log</h1>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left"><th className="p-2">Time</th><th className="p-2">User</th><th className="p-2">Role</th><th className="p-2">Action</th><th className="p-2">Patient</th></tr></thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b">
              <td className="p-2 font-mono text-xs">{new Date(e.timestamp).toLocaleString()}</td>
              <td className="p-2">{e.userName}</td>
              <td className="p-2">{e.role}</td>
              <td className="p-2">{e.action}</td>
              <td className="p-2 font-mono text-xs">{e.patientId ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
