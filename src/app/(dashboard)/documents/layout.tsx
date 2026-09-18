import type { ReactNode } from 'react'
import { DocumentsTabs } from '@/components/DocumentsTabs'

export default function DocumentsLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-foreground">Documents</h1>
      <DocumentsTabs />
      <div className="mt-4">{children}</div>
    </div>
  )
}
