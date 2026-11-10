import type { ComponentType } from 'react';
import { useParams } from 'react-router';
import { useSeats } from '@/features/seats/SeatProvider';

/**
 * A screen about one thing, named in its address by `param` (an offer, a deal, a creator's page), made to start over
 * whenever the address moves on to another one, or the seat it is seen from changes.
 *
 * React Router keeps a screen on show when only that part of the address changes: a notification about one deal
 * pressed while looking at another, or Back and Forward between two offers. Everything open or typed on the screen
 * stays with it. So a rating written for one deal sat on the next deal's form, ready to send; and a decline written
 * for one offer, its sheet still open after the phone's Back, declined the offer underneath instead. With a key per
 * thing, each gets a screen of its own and nothing is left over from the last.
 */
export function startOverFor(Page: ComponentType, param: string): ComponentType {
  return function PageAboutOneThing() {
    const params = useParams();
    const { seat } = useSeats();
    return <Page key={`${params[param] ?? ''}|${seat ? `${seat.side}:${seat.id}` : ''}`} />;
  };
}
