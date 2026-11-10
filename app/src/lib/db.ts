// Small helpers over supabase-js responses: throw the error (TanStack Query and useAction show it), return the data.
// Each takes its type straight from the response, so rows keep their generated types in any context.

interface Response {
  data: unknown;
  error: unknown;
  /** The HTTP status of the answer; 0 when the request never got one (offline, blocked, timed out). */
  status?: number;
}

/**
 * The error as it's thrown: the server's own, carrying the answer's HTTP status. The status is how the rest of the app
 * tells "never reached the server" (0) from "the server said no" (4xx) from "the server is struggling" (5xx), which
 * decides whether asking again can help (lib/queryClient.ts).
 */
function failure(error: unknown, status: number | undefined): unknown {
  if (error && typeof error === 'object' && typeof status === 'number' && !('status' in error)) {
    try {
      Object.assign(error, { status });
    } catch {
      // a frozen error is thrown as it is
    }
  }
  return error;
}

/** Rows from a list query, or a function's result; the error is thrown. */
export async function must<R extends Response>(request: PromiseLike<R>): Promise<Exclude<R['data'], null>> {
  const { data, error, status } = await request;
  if (error) throw failure(error, status);
  return data as Exclude<R['data'], null>;
}

/** A row that may not exist (maybeSingle): null when it doesn't. */
export async function maybe<R extends Response>(request: PromiseLike<R>): Promise<R['data']> {
  const { data, error, status } = await request;
  if (error) throw failure(error, status);
  return data;
}

/** A row that has to exist: a missing one (deleted, or not this person's to see) is an error too. */
export async function one<R extends Response>(request: PromiseLike<R>, what = 'That'): Promise<NonNullable<R['data']>> {
  const { data, error, status } = await request;
  if (error) throw failure(error, status);
  if (data == null) throw Object.assign(new Error(`${what} wasn’t found. It may have been removed, or it isn’t yours to see.`), { status: 404 });
  return data as NonNullable<R['data']>;
}

/** How many rows a counting request found (`select(…, { count: 'exact', head: true })`: the database counts, no rows travel). */
export async function counted<R extends Response & { count: number | null }>(request: PromiseLike<R>): Promise<number> {
  const { count, error, status } = await request;
  if (error) throw failure(error, status);
  return count ?? 0;
}
