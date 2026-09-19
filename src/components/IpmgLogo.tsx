// Inland Psychiatric Medical Group's real logo, from their official site
// (inlandpsych.com) -- this pilot is built specifically for IPMG, so their
// own mark is the primary brand shown throughout, not a generic stand-in.
// ipmg-icon.png is a crop of just the four-diamond mark (colorful, reads
// fine on both light and dark surfaces); ipmg-logo.png is the full lockup
// including the practice name in dark text, which only reads on light
// backgrounds.

export function IpmgIcon({ className = 'h-6 w-auto' }: { className?: string }) {
  return <img src="/branding/ipmg-icon.png" alt="Inland Psychiatric Medical Group" className={className} />
}

export function IpmgWordmark({ className = 'h-10 w-auto' }: { className?: string }) {
  return <img src="/branding/ipmg-logo.png" alt="Inland Psychiatric Medical Group" className={className} />
}
