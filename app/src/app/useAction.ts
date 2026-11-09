import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useToast } from '@/components/ui';
import { errorMessage } from '@/lib/errors';

/**
 * One move: call the database, then mark the affected queries stale and say what happened. A refusal shows the
 * database's own reason. Realtime would invalidate the same keys a moment later; doing it here makes the person
 * who moved see the result at once.
 */
export function useAction<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  options: {
    invalidate?: (result: TResult, vars: TVars) => QueryKey[];
    success?: string | ((result: TResult, vars: TVars) => string | null);
    onSuccess?: (result: TResult, vars: TVars) => void;
    /** Leave errors to the caller (a form that shows them inline). */
    quiet?: boolean;
  } = {},
) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, vars) => {
      for (const queryKey of options.invalidate?.(result, vars) ?? []) void queryClient.invalidateQueries({ queryKey });
      const msg = typeof options.success === 'function' ? options.success(result, vars) : options.success;
      if (msg) toast.info(msg);
      options.onSuccess?.(result, vars);
    },
    onError: (e) => {
      if (!options.quiet) toast.error(errorMessage(e));
    },
  });
}
