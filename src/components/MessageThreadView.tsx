export interface MessageRow {
  id: number
  senderRole: 'provider' | 'patient'
  senderName: string
  body: string
  createdAt: string | Date
}

/**
 * Shared by both the doctor-side inbox and the patient portal's Messages
 * tab -- `viewerRole` decides which side of the thread reads as "you"
 * (right-aligned) vs. the other party (left-aligned), the only thing that
 * differs between the two contexts.
 */
export function MessageThreadView({ messages, viewerRole }: { messages: MessageRow[]; viewerRole: 'provider' | 'patient' }) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages yet. Send the first one below.</p>
  }
  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const isOwn = m.senderRole === viewerRole
        return (
          <div key={m.id} className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${isOwn ? 'ml-auto bg-primary/10 text-foreground' : 'bg-secondary text-foreground'}`}>
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{m.senderName}</p>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{new Date(m.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
          </div>
        )
      })}
    </div>
  )
}
