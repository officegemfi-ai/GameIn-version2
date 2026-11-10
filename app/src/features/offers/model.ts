// What an offer means for the side looking at it. Pure, tested in features/shared.test.tsx.
import type { Tone } from '@/components/ui';
import type { OfferTab } from '@/lib/keys';
import { otherSide, type OfferBoardRow, type Side } from '@/lib/types';

/**
 * The stored state in which an open offer waits on a side: a sent offer waits on the creator, a countered one (or a
 * pitch) on the brand. The database's own rule (private.waiting_on), mirrored so a tab can ask for its offers by a
 * stored column, which is what the database has an index and statistics for.
 */
export const waitsOn = { creator: 'sent', brand: 'countered' } as const satisfies Record<Side, OfferBoardRow['raw_status']>;

/** The stored state the open offers of a tab are in, for the seat looking. */
export const tabState = (tab: Exclude<OfferTab, 'closed'>, side: Side) => waitsOn[tab === 'yours' ? side : otherSide(side)];

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
