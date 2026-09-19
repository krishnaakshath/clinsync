import type { Role } from '@/lib/auth'

/**
 * Sourced only from role-gated behavior that actually exists in the code
 * today (auto-classify toggle, practice info, EHR connections, and provider
 * name edits are all admin-only — see settings/page.tsx and its API
 * routes). Not aspirational, doesn't describe a permission the app doesn't
 * enforce.
 */
export const ROLE_CAPABILITIES: Record<Role, { label: string; summary: string; bullets: string[] }> = {
  crc: {
    label: 'Clinical Research Coordinator',
    summary: 'Runs day-to-day pre-screening: reviews patients, resolves identity matches, and manages intake forms.',
    bullets: [
      'View and search the Patients workbook across all trials',
      'Review and confirm/reject Identity Matching Queue candidates',
      'Send and track intake forms, and view Trials & Protocols',
      'Manage Calendar, Broadcasts, and Experience Surveys',
      'View Reports, Documents, and the Audit Log',
    ],
  },
  pi: {
    label: 'Principal Investigator',
    summary: 'Same operational access as a Research Coordinator, used to make clinical eligibility calls from the evidence Clinsync surfaces.',
    bullets: [
      'Everything a Research Coordinator can do',
      'View "My Patients" — the panel of patients currently assigned to them',
      'Review screening evidence to confirm or overturn an eligibility verdict',
    ],
  },
  admin: {
    label: 'Administrator',
    summary: 'Full operational access plus practice-level configuration that affects every user.',
    bullets: [
      'Everything a Research Coordinator can do',
      'Edit Practice Information and EHR Connection settings',
      'Toggle auto-classification on form completion',
      'Rename entries in the Provider Profiles roster',
      'Issue and revoke Patient Portal access credentials',
    ],
  },
}
