import { Button, ButtonLink, Card, Empty } from '@/components/ui';
import { partySeats, type Parties } from './party';
import { useSeat, useSeats } from './SeatProvider';

/**
 * Shown in place of an offer, a deal or a conversation that belongs to a different seat than the one being acted
 * from (opened from a notification, a link or a bookmark): whose it is, and one press to switch to that seat. The page
 * then shows from the right side, with that seat's moves. `bare` leaves out the card, for a place that already is one.
 */
export function OtherSeat({ what, of, bare }: { what: 'offer' | 'deal' | 'conversation'; of: Parties; bare?: boolean }) {
  const seat = useSeat();
  const { seats, setSeat } = useSeats();
  const mine = partySeats(seats, of);
  const body =
    mine.length > 0 ? (
      <Empty
        title={`This ${what} belongs to ${mine.length === 1 ? 'another of your seats' : 'two of your other seats'}`}
        action={
          <div className="g-row-wrap" style={{ justifyContent: 'center' }}>
            {mine.map((s) => (
              <Button key={`${s.side}:${s.id}`} variant="primary" onClick={() => setSeat(s)}>
                switch to {s.name}
              </Button>
            ))}
          </div>
        }
      >
        {`You’re acting as ${seat.name}. Switch to ${mine.map((s) => s.name).join(' or ')} to see it and act on it.`}
      </Empty>
    ) : (
      <Empty title={`This ${what} isn’t one of yours`} action={<ButtonLink to="/dashboard">back to home</ButtonLink>}>
        None of your seats is a party to it.
      </Empty>
    );
  return bare ? body : <Card>{body}</Card>;
}
