import { Redis } from '@upstash/redis'

// Vercel's Upstash Redis integration provisions KV_REST_API_URL / KV_REST_API_TOKEN
// (not UPSTASH_REDIS_REST_URL/TOKEN, which is what Redis.fromEnv() looks for) —
// construct the client explicitly with those names.
function createRedis() {
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  })
}

let _redis: Redis | null = null
function getRedis() {
  if (!_redis) _redis = createRedis()
  return _redis
}

/**
 * Read-through cache: returns the cached value if present, otherwise
 * calls `loader`, caches its result for `ttlSeconds`, and returns it.
 * Used to keep the Patients workbook and Patient Detail screens fast
 * without re-querying Postgres on every request.
 */
export async function getOrSetCache<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const cached = await getRedis().get<T>(key)
  if (cached !== null && cached !== undefined) return cached
  const fresh = await loader()
  await getRedis().set(key, fresh, { ex: ttlSeconds })
  return fresh
}

export async function invalidateCache(key: string): Promise<void> {
  await getRedis().del(key)
}

/**
 * Deletes every cached key starting with `prefix` — for a cache keyed per
 * filter combination (e.g. reviewsListCacheKey), the write path can't know
 * every filter combination a reader might have cached under, so a single
 * invalidateCache(key) call for one specific key (like the no-filter view)
 * silently misses every other cached filter combination. Safe at Clinsync's
 * real scale (a handful of keys per prefix, not thousands).
 */
export async function invalidateCacheByPrefix(prefix: string): Promise<void> {
  const keys = await getRedis().keys(`${prefix}*`)
  if (keys.length > 0) await getRedis().del(...keys)
}

export function patientListCacheKey(trialId: string | null): string {
  return `patients:list:${trialId ?? 'all'}`
}

export function patientDetailCacheKey(anonId: string): string {
  return `patients:detail:${anonId}`
}

export function formTemplatesListCacheKey(): string {
  return 'form-templates:list'
}

export function formSubmissionsListCacheKey(filters: string): string {
  return `form-submissions:list:${filters}`
}

export function dashboardCacheKey(): string {
  return 'dashboard:data'
}

export function broadcastsListCacheKey(): string {
  return 'broadcasts:list'
}

export function reviewsListCacheKey(filters: string): string {
  return `reviews:list:${filters}`
}

export function pipelineDashboardCacheKey(fromISO: string, toISO: string): string {
  return `pipeline-dashboard:${fromISO}:${toISO}`
}
