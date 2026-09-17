const COLORS: Record<string, string> = {
  system: 'text-muted-foreground',
  intakeq: 'text-sky-700',
  tebra: 'text-teal-700',
  staff: 'text-emerald-700',
}

// Display labels are intentionally generic -- Clinsync is a standalone
// product, not a connector for two named external systems, so the UI never
// names the reference products this data model was originally informed by.
const LABELS: Record<string, string> = {
  system: 'System',
  intakeq: 'Intake Form',
  tebra: 'Clinical Record',
  staff: 'Staff',
}

// The column header text itself ("Name", "DOB", etc.) already sits next
// to this tag, and the tag's own text states the source directly -- a lock
// glyph added no information a screen reader or sighted user didn't
// already have, and reads as decorative icon clutter; status/source is
// communicated by text and color only.
export function SourceTag({ source }: { source: 'system' | 'intakeq' | 'tebra' | 'staff' }) {
  return <span className={`text-[10px] font-semibold uppercase tracking-wide ${COLORS[source]}`}>{LABELS[source]}</span>
}
