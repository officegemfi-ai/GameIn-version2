import { Navigate, useParams } from 'react-router';
import { ErrorState, Loading } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { useProofDeal } from './api';

/** /proofs/:id (from to-dos and notifications) → the deal it belongs to, scrolled to the proof. */
export default function ProofRedirect() {
  const { id = '' } = useParams();
  const q = useProofDeal(id);
  if (q.isPending) return <Loading />;
  if (q.isLoadingError) return <ErrorState error={errorMessage(q.error)} />;
  return <Navigate to={`/deals/${q.data.deal_id}#proof-${id}`} replace />;
}
