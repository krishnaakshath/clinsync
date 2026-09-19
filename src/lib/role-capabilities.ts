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
    summary: 'Runs day-to-day pre-screening and practice operations: reviews patients, resolves identity matches, manages intake forms, and handles billing.',
    bullets: [
      'View and search the Patients workbook across all trials, Workbook, and Identity Matching',
      'Send and track intake forms via Form Templates and Client Forms',
      'Manage Calendar, Billing, Broadcasts, Experience Surveys, and the Pipeline Dashboard',
      'View Reports and Documents',
    ],
  },
  pi: {
    label: 'Principal Investigator',
    summary: 'A focused, clinical-only view for making eligibility calls from the evidence Clinsync surfaces — practice operations (billing, forms administration, broadcasts, reports) are the coordinator\'s and admin\'s tools, not shown here.',
    bullets: [
      'View "My Patients" — the panel of patients currently assigned to them',
      'Review screening evidence to confirm or overturn an eligibility verdict',
      'View the Patients workbook, Trials & Protocols, and Calendar',
      'Message patients directly',
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
