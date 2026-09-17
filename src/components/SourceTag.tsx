const COLORS: Record<string, string> = {
  system: 'text-muted-foreground',
  intakeq: 'text-sky-700',
  tebra: 'text-teal-700',
  staff: 'text-emerald-700',
}

// The column header text itself ("Name", "DOB", etc.) already sits next
// to this tag, and the tag's own text ("tebra", "intakeq", "staff")
// states the source directly -- a lock glyph added no information a
// screen reader or sighted user didn't already have, and reads as
// decorative icon clutter against the real IntakeQ/Tebra reference,
// where status/source is communicated by text and color only.
export function SourceTag({ source }: { source: 'system' | 'intakeq' | 'tebra' | 'staff' }) {
  return <span className={`text-[10px] font-semibold uppercase tracking-wide ${COLORS[source]}`}>{source}</span>
}
