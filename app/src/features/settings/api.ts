import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { must, one } from '@/lib/db';
import { keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';

/** The account's own name (profiles), which teammates and the people it deals with see. */
export function useProfile(userId: string) {
  return useQuery({
    queryKey: keys.profile(userId),
    queryFn: () => one(supabase.from('profiles').select('display_name').eq('id', userId).maybeSingle(), 'Your profile'),
  });
}

export function useSaveProfileName(userId: string) {
  return useAction((name: string) => must(supabase.from('profiles').update({ display_name: name.trim() }).eq('id', userId)), {
    invalidate: () => [keys.profile(userId)],
    success: 'Saved.',
  });
}
