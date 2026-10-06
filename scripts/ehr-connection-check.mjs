#!/usr/bin/env node
// EHR connectivity check for the practice owner, run with REAL credentials
// from the environment (never from a file in the repo):
//
//   INTAKEQ_API_KEY=... TEBRA_CUSTOMER_KEY=... TEBRA_USER=... TEBRA_PASSWORD=... \
//     npm run ehr:check            # or: npx tsx scripts/ehr-connection-check.mjs
//
// Options:
//   --no-counts   only validate credentials (1 call per vendor); skip the
//                 full client/patient listing used to print counts.
//
// Prints connectivity and record COUNTS only -- never credentials, names or
// any other patient data. Exit code 0 when every configured vendor passed,
// 1 otherwise, 2 when nothing was configured.
//
// Uses the same client code as the app (src/connectors/*.client.ts), loaded
// through tsx, so a pass here means the app's connectors will work too.
// Note: listing IntakeQ clients costs one request per 100 clients against
// IntakeQ's quota (standard plan: 10 requests/minute, 500/day).

import { createIntakeQClient } from '../src/connectors/intakeq.client.ts'
import { createTebraClient } from '../src/connectors/tebra.client.ts'
import { EhrConnectorError } from '../src/connectors/errors.ts'

const withCounts = !process.argv.includes('--no-counts')
const env = process.env

function describeError(err) {
  // Only ever print our own normalized, credential-free messages.
  if (err instanceof EhrConnectorError) return `${err.kind}: ${err.message}`
  return 'unexpected error (details suppressed so no credentials can leak)'
}

async function check(label, configured, missingHint, run) {
  if (!configured) {
    console.log(`${label}: skipped (${missingHint})`)
    return null
  }
  try {
    const summary = await run()
    console.log(`${label}: OK${summary ? ` -- ${summary}` : ''}`)
    return true
  } catch (err) {
    console.log(`${label}: FAILED -- ${describeError(err)}`)
    return false
  }
}

const results = []

results.push(await check(
  'IntakeQ',
  Boolean(env.INTAKEQ_API_KEY),
  'set INTAKEQ_API_KEY',
  async () => {
    const client = createIntakeQClient({ apiKey: env.INTAKEQ_API_KEY })
    await client.testConnection()
    if (!withCounts) return 'credentials accepted'
    const clients = await client.listClients()
    return `credentials accepted; ${clients.length} client(s) on file`
  },
))

const tebraVars = ['TEBRA_CUSTOMER_KEY', 'TEBRA_USER', 'TEBRA_PASSWORD']
const tebraMissing = tebraVars.filter((v) => !env[v])
results.push(await check(
  'Tebra',
  tebraMissing.length === 0,
  tebraMissing.length === tebraVars.length
    ? 'set TEBRA_CUSTOMER_KEY, TEBRA_USER and TEBRA_PASSWORD'
    : `also set ${tebraMissing.join(', ')} -- all three are required`,
  async () => {
    const client = createTebraClient({ customerKey: env.TEBRA_CUSTOMER_KEY, user: env.TEBRA_USER, password: env.TEBRA_PASSWORD })
    await client.testConnection()
    if (!withCounts) return 'credentials accepted (GetPractices)'
    const patients = await client.listPatients()
    return `credentials accepted; ${patients.length} patient(s) returned by GetPatients`
  },
))

const ran = results.filter((r) => r !== null)
if (ran.length === 0) {
  console.log('Nothing to check: no EHR credentials in the environment.')
  process.exit(2)
}
process.exit(ran.every(Boolean) ? 0 : 1)
