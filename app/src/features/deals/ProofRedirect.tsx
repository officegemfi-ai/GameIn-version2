import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router';
import { ErrorState, Loading } from '@/components/ui';
import { one } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

/** /proofs/:id (from to-dos and notifications) → the deal it belongs to, scrolled to the proof. */
export default function ProofRedirect() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['proof-deal', id], queryFn: () => one(supabase.from('proofs').select('deal_id').eq('id', id).maybeSingle(), 'That proof') });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={errorMessage(q.error)} />;
  return <Navigate to={`/deals/${q.data.deal_id}#proof-${id}`} replace />;
}
