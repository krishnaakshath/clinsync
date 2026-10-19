/**
 * `request.json()` that resolves to `undefined` instead of throwing on a
 * body that isn't valid JSON. Callers pass the result straight to their zod
 * schema's safeParse, so a malformed body gets the route's normal 400
 * rather than an unhandled 500.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

/**
 * Parses a route param expected to be a DB serial id. `Number(id)` alone
 * turns a non-numeric segment into `NaN`, which then reaches the query
 * layer as `eq(table.id, NaN)` -- some drivers reject that at the wire
 * level with an uncaught 500 instead of the clean 404/400 a bad id should
 * produce. A strict digits-only match keeps "1e5" and "1.5" from being
 * silently coerced into a different row id, too.
 */
export function parseIntParam(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null
}
