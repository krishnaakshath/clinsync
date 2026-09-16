import { requireSessionOrRedirect } from '@/lib/auth'

export default async function SettingsPage() {
  // Must be the first statement — see the comment in patients/page.tsx.
  const session = await requireSessionOrRedirect()
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Connections</h2>
        <p className="text-sm">IntakeQ: <span className="font-medium text-green-700">Connected (mock)</span></p>
        <p className="text-sm">Tebra FHIR: <span className="font-medium text-green-700">Connected (mock)</span></p>
      </section>
      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Compliance</h2>
        <p className="text-sm">BAA status: <span className="font-medium text-amber-700">Pending signature (demo placeholder)</span></p>
        <p className="text-sm">Environment: Pilot / Demo</p>
      </section>
      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase text-slate-500">Signed in as</h2>
        <p className="text-sm">{session.name} ({session.role})</p>
      </section>
    </div>
  )
}
