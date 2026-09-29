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
      'View Reports and Documents, and receive, file, and re-file incoming documents to a patient',
      'View and manage the live bed/ward status board, including marking rooms clean',
      'View the Lab worklist across all patients',
      'View the Staff Directory and credential expiry status',
      'Confirm or decline public booking requests into real appointments',
    ],
  },
  pi: {
    label: 'Principal Investigator',
    summary: 'A focused, clinical-only view for making eligibility calls from the evidence Clinsync surfaces — practice operations (billing, forms administration, broadcasts, reports) are the coordinator\'s and admin\'s tools, not shown here.',
    bullets: [
      'View "My Patients" — the panel of patients currently assigned to them',
      'Review screening evidence to confirm or overturn an eligibility verdict',
      'View the Patients workbook, Trials & Protocols, and Calendar',
      'Review a patient\'s actual submitted answers in Client Forms',
      'View and download filed documents (read-only -- receiving and filing is a coordinator/front-desk action)',
      'Message patients directly',
      'View the live bed/ward status board for their admitted patients',
      'Dispense medications from the Pharmacy dashboard',
      'Order lab tests and manage the Lab worklist: mark samples collected, enter results, and cancel orders',
      'View the Staff Directory and credential expiry status',
      'View the public booking requests queue (read-only -- confirming/declining is a registration-staff action)',
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
      'View and manage the live bed/ward status board, including blocking and unblocking rooms',
      'Dispense medications from the Pharmacy dashboard',
      'Order lab tests and manage the Lab worklist: mark samples collected, enter results, and cancel orders',
      'Add and edit staff members and credentials in the Staff Directory',
      'Confirm or decline public booking requests into real appointments',
      'Permanently delete a received document',
      'Look up a patient at the pharmacy counter, dispense, and log a dispense bill.',
    ],
  },
  frontdesk: {
    label: 'Front Desk / Reception',
    summary: 'Handles walk-in and phone patient traffic at the point of check-in: rooming, doctor assignment, insurance eligibility, and billing visibility -- not the clinical evidence-review or practice-administration tools used by other roles.',
    bullets: [
      'Check patients in and assign rooms',
      'Route patients to a provider for inpatient or outpatient visits',
      'Record insurance eligibility checks',
      'View and manage billing, insurance, and payment status',
      'Receive, file, and re-file incoming documents (including insurance cards, EOBs, and authorizations) to a patient',
      'View and manage the live bed/ward status board',
      'View the Lab worklist and mark samples collected',
      'View the Staff Directory and credential expiry status',
      'Confirm or decline public booking requests into real appointments',
    ],
  },
  pharmacy: {
    label: 'Pharmacy',
    summary: 'Works the dispensing counter: looks a patient up by ID, reads what their doctor prescribed, dispenses from practice stock, and logs the bill — never prescribes, never edits a prescription, and never approves a charge.',
    bullets: [
      'Look up any patient by their patient ID to see their prescribed medications',
      'View a patient\'s active medication episodes as the prescriber entered them (read-only)',
      'Dispense a medication from practice stock against a specific prescription',
      'Log a bill for a dispense as a draft charge for the billing team to review',
      'View the medication catalog, stock levels, and what the practice is currently prescribing',
      'Add a medication to the practice catalog',
    ],
  },
}
