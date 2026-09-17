// Skeleton for the audit log table: title + the 5-column table
// (Time, User, Role, Action, Patient).
export default function AuditLogLoading() {
  const columns = 5
  const rows = 12

  return (
    <div>
      <div className="mb-6 h-7 w-36 animate-pulse rounded-md bg-muted" />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="p-3">
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className={`border-b border-border ${rowIndex % 2 === 1 ? 'bg-muted/40' : ''}`}>
              <td className="p-3"><div className="h-3 w-28 animate-pulse rounded bg-muted" /></td>
              <td className="p-3"><div className="h-4 w-24 animate-pulse rounded bg-muted" /></td>
              <td className="p-3"><div className="h-4 w-16 animate-pulse rounded bg-muted" /></td>
              <td className="p-3"><div className="h-4 w-40 animate-pulse rounded bg-muted" /></td>
              <td className="p-3"><div className="h-3 w-16 animate-pulse rounded bg-muted" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
