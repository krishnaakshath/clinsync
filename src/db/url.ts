// Connection-string helpers shared by the app's pool (src/db/client.ts).
// Ported from the hims-platform lineage. Nothing here ever returns the
// password or user name.

// A database on this machine (local Postgres for development/CI) has no TLS;
// every hosted database (Neon etc.) does. `postgres` covers the app
// container reaching this repo's own docker-compose.yml `postgres` service
// by its in-network service name (not host-exposed 127.0.0.1:55432, which
// only resolves from the host) -- a real hosted DB is never reachable at
// that literal hostname, so this can't misclassify one as local.
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  return /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\]|postgres)(:\d+)?\//.test(url ?? '')
}

/** pg `ssl` option for a connection string: off locally, TLS everywhere else. */
export function sslFor(url: string | undefined): false | { rejectUnauthorized: false } {
  return isLocalDatabaseUrl(url) ? false : { rejectUnauthorized: false }
}
