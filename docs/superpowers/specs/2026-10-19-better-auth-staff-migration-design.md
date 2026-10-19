# Staff Auth Migration to Better Auth

**Status:** design drafted, pending your review before an implementation plan is written.
**Project 2 of 4** in the current queue (Tebra full data sync was Project 1, just closed out).
Patient-portal auth is a separate, later project — not touched here.

## 0. Decisions already made (confirmed in conversation before this doc)

- **Motivation: HIPAA audit-readiness.** The goal isn't a preference swap — it's reducing the
  amount of hand-rolled security-sensitive code (custom JWT signing, custom MFA, custom
  pending-session bridging) in favor of a maintained, vetted auth library, and closing specific
  gaps a HIPAA review would likely flag.
- **Scope: staff/admin auth only.** The patient portal (`patient-session.ts`, separate
  credentials on the `patients` table, optional MFA) is a fully separate system and is an
  explicit non-goal of this project. It keeps working exactly as it does today, untouched.
- **Approach: full swap**, not a thin wrapper. Better Auth's own session, credential, and 2FA
  primitives replace the equivalent custom code outright, rather than layering Better Auth under
  the existing custom MFA/session-bridge logic. This is the approach that actually reduces
  hand-written security surface, which is the whole point.
- **Explicitly out of scope, logged as a follow-up, not folded in:** centralizing route
  protection into `middleware.ts`. There is no middleware anywhere in this repo today — every
  route manually checks its own session via `requireSession()`/`requireSessionOrRedirect()`. This
  migration swaps *what* those checks read (Better Auth's session instead of a custom JWT), not
  *how* they're enforced. Centralizing enforcement is a bigger, separate change.
- **Admin account becomes a real DB user.** Today it authenticates via
  `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`ADMIN_NAME` env vars with no `users` row — a structural
  HIPAA unique-identification gap as well as a hard blocker for Better Auth, which has no concept
  of a non-DB account. A one-time migration script creates a real user row from those env vars.
- **Schema is free to change.** The `role` Postgres enum is wider than what this app uses because
  of shared ancestry with a sibling codebase ("hims-platform lineage"), but that codebase runs
  its own separate database now — nothing else live depends on this schema.
- **Backup codes: in scope, added now.** Better Auth's `twoFactor` plugin supports them natively.
  Today the only MFA-recovery path is an admin-assisted reset; backup codes close that gap for
  roughly free marginal cost while this flow is already being rebuilt.
- **Session idle timeout: upgraded to a real one.** Today's `SessionTimeoutWarning` idle timer is
  explicitly documented in its own code as a UI nudge, not a security boundary — the actual
  session is a flat 8h-from-login JWT with no concept of inactivity. This migration adds a real
  server-enforced idle/inactivity expiry on top of the existing 8h absolute cap, since Better
  Auth supports this natively and it's a genuine HIPAA "automatic logoff" win that wasn't cheaply
  possible before.
- **No feature branch.** Per your standing preference on this repo, this work happens directly
  on `master` in small, independently test-passing commits — not a long-lived branch.

## 1. Today's baseline (ground truth, for reference during implementation)

- Staff sessions: stateless JWT (`jose`, HS256) in an httpOnly cookie
  (`clinsync_demo_session`), 8h absolute expiry, signed with `SESSION_SECRET`. No DB session
  table, no server-side revocation — `src/lib/auth.ts`.
- Passwords: Node `scryptSync`, hardened params (N=131072, r=8, p=1), format
  `<hexSalt>:<hexHash>`, `timingSafeEqual` verify — `src/lib/password.ts`.
- MFA: TOTP via `otpauth`, mandatory for all staff logins unless `DISABLE_STAFF_MFA=true`
  (demo-only escape hatch). Redis-backed single-use replay protection per time-step, scoped by
  identity + a hash of the secret. Secrets encrypted at rest (AES-256-GCM,
  `IDENTITY_ENCRYPTION_KEY`) — `src/lib/mfa.ts`, `src/lib/crypto.ts`.
- Login is two-step: password check, then a 5-minute pending-MFA JWT cookie
  (`clinsync_pending_staff_mfa`) bridges to the TOTP-check step —
  `src/lib/mfa-pending-session.ts`.
- Roles: Postgres enum `crc | pi | admin` (plus unused hims-platform values), enforced by manual
  per-route checks (e.g. `session.role !== 'admin'`), not middleware.
- Admin MFA state lives on the `app_settings` singleton row
  (`adminMfaSecretEncrypted`/`adminMfaEnabled`) since the env-var admin has no `users` row to
  hang it off.
- Audit: `audit_log` table, written to manually at each relevant call site via `logAudit()`,
  which requires a non-nullable `Session` (a structural guarantee against unattributed entries).
- Rate limiting: Redis-backed, `src/lib/rate-limit.ts`, already tuned for login/MFA-verify
  endpoints.

## 2. Target architecture & schema

Better Auth integrates as a route handler (`src/app/api/auth/[...all]/route.ts`) plus a
server-side `auth` instance and a thin client helper, using its Drizzle adapter (schema generated
directly from the Better Auth config, since the app is already on Drizzle).

- The existing `users` table's columns (`role`, `name`, etc.) move onto Better Auth's own `user`
  table via `additionalFields`, rather than maintaining two separate tables both representing a
  staff member. `role` stays the same enum.
- The env-var admin becomes a real `user` row, created by a one-time migration script from
  `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`/`ADMIN_NAME`. Those env vars stop being read for auth
  purposes afterward.
- `app_settings`' admin-specific MFA columns are removed — admin's 2FA state lives in Better
  Auth's own `twoFactor` table like every other staff user, since it's now a normal row.
- New tables from Better Auth: `session`, `account`, `verification`, `twoFactor` (plugin).

## 3. Credentials & MFA

- **Passwords:** Better Auth is configured with a custom hasher/verifier that calls the existing
  `src/lib/password.ts` scrypt verify function directly. No forced password resets; the audited
  scrypt params are unchanged. New password sets (and the admin's initial migrated password) go
  through the same function — one hashing code path, not two.
- **2FA/TOTP:** Better Auth's official `twoFactor` plugin replaces `mfa.ts` and all of
  `mfa-pending-session.ts` outright — its plugin natively handles the password-then-TOTP two-step
  flow with its own short-lived verification token, so the hand-rolled pending-cookie bridge is
  deleted, not ported. Existing encrypted TOTP secrets are decrypted (current `crypto.ts` key)
  and re-encrypted into Better Auth's own storage format by a one-time migration script — no
  re-enrollment required for existing staff.
- **Replay protection:** Better Auth's `twoFactor` plugin has no built-in equivalent to today's
  "each TOTP code usable once per time-step" Redis check. This is ported as a hook into Better
  Auth's verification flow, not dropped.
- **Backup codes:** enabled via the `twoFactor` plugin's native support. New capability; no
  existing data to migrate for this part.

## 4. Sessions, route protection, audit & rate limiting

- **Sessions:** Better Auth sessions are DB-backed (a real row per login), giving actual
  server-side revocation — not possible today. 8h absolute expiry is kept, plus a new
  30-minute server-enforced idle/inactivity expiry on top (a common clinical-setting default;
  easy to tune later since it's one config value, not a structural decision).
- **Route protection:** every `requireSession()`/`requireSessionOrRedirect()` call site is
  rewritten to read Better Auth's session instead of the custom JWT — still a manual per-route
  check, not middleware (see Section 0).
- **Audit logging:** Better Auth's lifecycle hooks (sign-in, sign-out, etc.) call the existing
  `logAudit()`, so these events keep landing in `audit_log` automatically instead of needing a
  manual call at every route.
- **Rate limiting:** the existing Redis-backed `rate-limit.ts` is kept and wired in via a hook,
  rather than running it alongside Better Auth's own built-in limiter redundantly.

## 5. Testing & rollout

- Most of the existing auth test suite (`tests/api/login*.test.ts`, `account-mfa-reset.test.ts`,
  `reset-mfa-admin.test.ts`, `route-gates.test.ts`, `queries/mfa-state.test.ts`) tests
  implementation details of the system being replaced and gets rewritten against Better Auth's
  actual behavior, not patched. Patient-portal auth tests are explicitly untouched and must keep
  passing unchanged throughout.
- Two one-time, idempotent migration scripts: (1) create the admin's real `user` row from env
  vars, (2) re-encrypt every staff member's TOTP secret into Better Auth's format.
- Rollout sequencing (direct-to-`master`, no PR to hide WIP behind) is the implementation plan's
  job, not this spec's — but the shape is: add Better Auth + schema → migrate
  credentials/2FA data with the old system still live → cut login routes over → remove the dead
  custom auth code, each step landing with `master` green.

## 6. Explicit non-goals

- Patient portal auth (separate project).
- Centralized middleware-based route protection (logged as a follow-up, not this project).
- Any change to `SESSION_SECRET`/`IDENTITY_ENCRYPTION_KEY` key material itself.
