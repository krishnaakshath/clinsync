import { getDb } from '@/db/client'
import { encounterNotes } from '@/db/schema'
import { desc, eq } from 'drizzle-orm'

export type EncounterNote = typeof encounterNotes.$inferSelect

export interface CreateNoteInput {
  patientId: string
  appointmentId: number | null
  admissionId: number | null
  noteType: 'progress' | 'nursing' | 'intake'
  authorName: string
  authorRole: 'crc' | 'pi' | 'admin' | 'frontdesk'
  subjective: string | null
  objective: string | null
  assessment: string | null
  plan: string | null
}

export async function createNote(input: CreateNoteInput): Promise<EncounterNote> {
  const [created] = await getDb().insert(encounterNotes).values(input).returning()
  return created
}

export async function getNoteById(id: number): Promise<EncounterNote | null> {
  const [row] = await getDb().select().from(encounterNotes).where(eq(encounterNotes.id, id))
  return row ?? null
}

export async function listNotesForPatient(patientId: string): Promise<EncounterNote[]> {
  return getDb().select().from(encounterNotes).where(eq(encounterNotes.patientId, patientId)).orderBy(desc(encounterNotes.createdAt))
}

export interface SignNoteResult {
  ok: boolean
  error?: string
}

// Only the note's own author, or an admin, may sign it -- and only while
// it's still a draft. A row's status only ever moves draft -> signed, once;
// there is deliberately no route anywhere that can move it back or edit a
// signed row's content (append-only, same principle as the audit log).
export async function signNote(id: number, signerName: string, signerIsAdmin: boolean): Promise<SignNoteResult> {
  const note = await getNoteById(id)
  if (!note) return { ok: false, error: 'Note not found' }
  if (note.status !== 'draft') return { ok: false, error: 'Note is already signed' }
  if (note.authorName !== signerName && !signerIsAdmin) return { ok: false, error: 'Only the note\'s author or an admin may sign it' }

  const result = await getDb().update(encounterNotes).set({ status: 'signed', signedAt: new Date() }).where(eq(encounterNotes.id, id)).returning({ id: encounterNotes.id })
  return { ok: result.length > 0 }
}
