import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Icon, TimeAgo } from '@/components/ui';
import { keys } from '@/lib/keys';
import { lastNotificationAt } from '@/lib/realtime';
import { useUser } from '@/features/auth/AuthProvider';
import { isParty, notifiedSeat } from '@/features/seats/party';
import { useSeat, useSeats } from '@/features/seats/SeatProvider';
import { describeEvent } from './describe';
import { markNotificationsRead, useNotifications, type NotificationItem } from './api';

/** How recently a notification must have come over Realtime for the screens it touched to count as refreshed. */
const CAUGHT_UP_MS = 10_000;

function line(n: NotificationItem, viewer: 'brand' | 'creator') {
  if (n.kind === 'message' || !n.event) return { text: 'New message', to: '/messages' };
  const e = n.event;
  return describeEvent(
    { kind: e.kind, data: e.data, amount_cents: e.amount_cents, deal_id: e.deal_id, offer_id: e.offer_id, side: e.actor_side },
    { brand: e.brand?.name ?? 'The brand', creator: e.creator?.display_name ?? 'The creator' },
    viewer,
  );
}

export function NotificationBell() {
  const user = useUser();
  const seat = useSeat();
  const { seats, setSeat } = useSeats();
  const queryClient = useQueryClient();
  const { data } = useNotifications(user.id);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const unread = (data ?? []).filter((n) => !n.read_at).length;

  // The safety net under Realtime: a notification newer than the last one seen means the screen may be behind.
  // Realtime brings a notification together with the rows it's about, and the screens those rows touch refresh at
  // once; so refresh what hasn't refreshed since it arrived (or since now, when it came some other way), not all of it.
  // "The last one seen" starts with the first answer, whatever it holds: an account's very first notification is as
  // much news as its hundredth.
  const loaded = data !== undefined;
  const newest = data?.[0]?.id ?? 0;
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (seen.current !== null && newest > seen.current) {
      const arrived = lastNotificationAt();
      const since = Date.now() - arrived < CAUGHT_UP_MS ? arrived : Date.now();
      void queryClient.invalidateQueries({ refetchType: 'active', predicate: (q) => q.state.fetchStatus !== 'fetching' && q.state.dataUpdatedAt < since });
    }
    seen.current = Math.max(seen.current ?? 0, newest);
  }, [loaded, newest, queryClient]);

  // opening the bell marks what's in it as read
  useEffect(() => {
    if (!open || unread === 0) return;
    const t = window.setTimeout(() => {
      void markNotificationsRead().then(
        () => queryClient.invalidateQueries({ queryKey: keys.notifications(user.id) }),
        () => {
          // not marked this time: they stay new, and opening the bell again tries again
        },
      );
    }, 1200);
    return () => window.clearTimeout(t);
  }, [open, unread, queryClient, user.id]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="g-bell" ref={box}>
      <button
        type="button"
        className="g-iconbtn"
        aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" />
        {unread ? <span className="g-count">{unread > 9 ? '9+' : unread}</span> : null}
      </button>
      {open ? (
        <div className="g-menu g-bell__panel" role="region" aria-label="Notifications">
          <div className="g-menu__label g-label">Notifications</div>
          {(data ?? []).length === 0 ? (
            <p className="g-muted g-small" style={{ padding: '8px 12px 12px' }}>Nothing yet. Offers, payments and proof show up here.</p>
          ) : (
            (data ?? []).map((n) => {
              // One bell serves every seat of the account. Each line is worded for the seat it was meant for, says so
              // when that isn't the seat being acted from, and pressing it goes there as that seat (unless the
              // current seat is a party too: then the page already works from here).
              const meant = n.event ? notifiedSeat(seats, n.event, seat) : null;
              const elsewhere = meant && !(meant.side === seat.side && meant.id === seat.id) ? meant : null;
              const { text, to } = line(n, meant?.side ?? seat.side);
              const go = () => {
                setOpen(false);
                if (elsewhere && n.event && !isParty(seat, n.event)) setSeat(elsewhere);
              };
              const body = (
                <>
                  <span className="g-dot" aria-hidden="true" />
                  <span className="g-notif__text">
                    {text}
                    <span className="g-notif__time">{elsewhere ? ` · for ${elsewhere.name}` : ''} · <TimeAgo at={n.created_at} /></span>
                  </span>
                </>
              );
              return to ? (
                <Link key={n.id} to={to} className="g-notif" data-read={!!n.read_at} onClick={go}>
                  {body}
                </Link>
              ) : (
                <div key={n.id} className="g-notif" data-read={!!n.read_at}>
                  {body}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
