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
      'Send and track intake forms via Form Templates and Client Forms, change a submission\'s status, and resolve form-vs-chart discrepancies',
      'Add New Patient (creates a real chart in Tebra) and see the practice-wide activity feed',
      'Manage Calendar, Billing, Broadcasts, Experience Surveys, and the Pipeline Dashboard',
      'View Reports and Documents',
    ],
  },
  pi: {
    label: 'Principal Investigator',
    summary: 'A focused, clinical-only view for making eligibility calls from the evidence Clinsync surfaces — practice operations (billing, sending forms, adding patients, the practice activity feed, broadcasts, reports) are the coordinator\'s and admin\'s tools, not shown here.',
    bullets: [
      'View "My Patients" — the panel of patients currently assigned to them',
      'Review screening evidence to confirm or overturn an eligibility verdict',
      'View the Patients workbook, Trials & Protocols, and Calendar',
      'Review a patient\'s actual submitted answers in Client Forms',
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

/**
 * Roles that get the practice-operations surface: Workbook, Identity
 * Matching, Form Templates, Billing, Reports, Documents, Broadcasts,
 * Experience Surveys, Pipeline Dashboard. LeftNav filters its links on this,
 * and every one of those pages (redirect to /) and their API routes (403)
 * enforce it server-side -- a hidden nav link alone is not access control.
 */
export const OPERATIONS_ROLES: readonly Role[] = ['admin', 'crc']

export function canAccessOperations(role: Role): boolean {
  return OPERATIONS_ROLES.includes(role)
}

/**
 * Owner decision: these practice-wide actions are admin/crc only, a PI is
 * clinical-review-only. Each has its own named predicate so a call site says
 * what it is gating, but they all resolve to the same operations roles here
 * -- change the policy in this file, nowhere else. API handlers enforce them
 * (403 right after requireSession); the UI hides the controls as a courtesy.
 *  - canSendForms: Send Form to Client, changing a form submission's status,
 *    resolving a form-vs-chart discrepancy.
 *  - canAddPatients: Add New Patient (creates a real chart in Tebra).
 *  - canViewActivityFeed: the practice-wide audit-log feed (notification bell).
 */
export function canSendForms(role: Role): boolean {
  return canAccessOperations(role)
}
export function canAddPatients(role: Role): boolean {
  return canAccessOperations(role)
}
export function canViewActivityFeed(role: Role): boolean {
  return canAccessOperations(role)
}
