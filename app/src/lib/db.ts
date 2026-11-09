// Small helpers over supabase-js responses: throw the error (TanStack Query and useAction show it), return the data.
// Each takes its type straight from the response, so rows keep their generated types in any context.

interface Response {
  data: unknown;
  error: unknown;
}

/** Rows from a list query, or a function's result; the error is thrown. */
export async function must<R extends Response>(request: PromiseLike<R>): Promise<Exclude<R['data'], null>> {
  const { data, error } = await request;
  if (error) throw error;
  return data as Exclude<R['data'], null>;
}

/** A row that may not exist (maybeSingle): null when it doesn't. */
export async function maybe<R extends Response>(request: PromiseLike<R>): Promise<R['data']> {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

/** A row that has to exist: a missing one (deleted, or not this person's to see) is an error too. */
export async function one<R extends Response>(request: PromiseLike<R>, what = 'That'): Promise<NonNullable<R['data']>> {
  const { data, error } = await request;
  if (error) throw error;
  if (data == null) throw Object.assign(new Error(`${what} wasn’t found. It may have been removed, or it isn’t yours to see.`), { status: 404 });
  return data as NonNullable<R['data']>;
}
