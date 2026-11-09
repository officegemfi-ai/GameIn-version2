// What an offer means for the side looking at it. Pure, tested in features/shared.test.tsx.
import type { Tone } from '@/components/ui';
import type { OfferBoardRow, Side } from '@/lib/types';

/** Where an offer stands for the side looking at it. */
export function offerState(o: Pick<OfferBoardRow, 'status' | 'waiting_on'>, side: Side): { label: string; tone: Tone; yourTurn: boolean; open: boolean } {
  switch (o.status) {
    case 'accepted':
      return { label: 'accepted', tone: 'mint', yourTurn: false, open: false };
    case 'declined':
      return { label: 'declined', tone: 'coral', yourTurn: false, open: false };
    case 'withdrawn':
      return { label: 'withdrawn', tone: 'neutral', yourTurn: false, open: false };
    case 'expired':
      return { label: 'expired', tone: 'neutral', yourTurn: false, open: false };
    default:
      return o.waiting_on === side
        ? { label: 'your turn', tone: 'mint', yourTurn: true, open: true }
        : { label: `waiting on ${o.waiting_on === 'brand' ? 'the brand' : 'the creator'}`, tone: 'amber', yourTurn: false, open: true };
  }
}
