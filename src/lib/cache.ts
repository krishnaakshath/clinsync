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
export function getRedis() {
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

export function providersListCacheKey(): string {
  return 'providers:list'
}

export function workbookListCacheKey(): string {
  return 'workbook:list'
}
