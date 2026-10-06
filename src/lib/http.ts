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
