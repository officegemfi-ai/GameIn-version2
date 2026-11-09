import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ActionDialog, Badge, Button, ButtonLink, Card, Empty, HexAvatar, Loading, QueryError, TextAreaField } from '@/components/ui';
import { itemsFromJson } from '@/lib/items';
import { formatCents } from '@/lib/money';
import { OFFER_HOURS } from '@/lib/rules';
import { formatDate } from '@/lib/time';
import type { PackageRow } from '@/lib/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSeats } from '@/features/seats/SeatProvider';
import { useBookPackage } from '@/features/offers/api';
import { useStartConversation } from '@/features/messages/api';
import { PlatformChips } from './CreatorCard';
import { useCreator } from './api';

export default function CreatorPage() {
  const { handle = '' } = useParams();
  const q = useCreator(handle);
  const { user } = useAuth();
  const { seat, seats } = useSeats();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<PackageRow | null>(null);
  const [note, setNote] = useState('');
  const [writing, setWriting] = useState(false);
  const [message, setMessage] = useState('');
  const book = useBookPackage();
  const start = useStartConversation();

  if (q.isPending) return <Loading />;
  if (q.isError) {
    return (
      <div className="g-page g-public__wide">
        <QueryError query={q} />
      </div>
    );
  }
  const c = q.data;
  // whose profile this is comes from your own seats: the owner's account id is never public
  const isMe = seats.some((s) => s.side === 'creator' && s.id === c.id);
  const asBrand = seat?.side === 'brand' ? seat : null;
  const packages = c.packages.filter((p) => p.active || isMe).sort((a, b) => Number(b.active) - Number(a.active) || a.price_cents - b.price_cents);

  return (
    <div className={`g-page${user ? '' : ' g-public__wide'}`}>
      <section className="g-card g-card--raised g-profilehead">
        <HexAvatar name={c.display_name} size={84} />
        <div className="g-stack-sm g-profilehead__text">
          <h1 className="g-display">{c.display_name}</h1>
          <span className="g-muted">@{c.handle} · on GameIn since {formatDate(c.created_at)}</span>
          {c.bio ? <p className="g-text-2">{c.bio}</p> : null}
          <PlatformChips platforms={c.platforms} />
        </div>
        <div className="g-profilehead__actions">
          {isMe ? (
            <>
              <ButtonLink to="/packages" variant="primary">manage packages</ButtonLink>
              <ButtonLink to="/settings">edit profile</ButtonLink>
            </>
          ) : asBrand ? (
            <>
              <ButtonLink to={`/offers/new?creator=${encodeURIComponent(c.handle)}`} variant="primary" icon="offers">custom offer</ButtonLink>
              <Button icon="messages" onClick={() => setWriting(true)}>message</Button>
            </>
          ) : !user ? (
            <ButtonLink to="/sign-up?role=brand" variant="primary">join as a brand to book</ButtonLink>
          ) : null}
        </div>
      </section>

      <Card title="Packages">
        {packages.length === 0 ? (
          <Empty title="No packages yet">{isMe ? 'Add your first package so brands can book you in one step.' : `${c.display_name} hasn’t listed any packages yet.`}</Empty>
        ) : (
          <div className="g-grid-2">
            {packages.map((p) => {
              const items = itemsFromJson(p.items);
              return (
                <article key={p.id} className="g-package">
                  <div className="g-between">
                    <span className="g-label">{p.code ?? 'package'}</span>
                    {!p.active ? <Badge>hidden</Badge> : p.length_label ? <Badge>{p.length_label}</Badge> : null}
                  </div>
                  <h3>{p.title}</h3>
                  {p.description ? <p className="g-muted g-small">{p.description}</p> : null}
                  <ul className="g-package__items">
                    {items.map((it, i) => (
                      <li key={i}>
                        {it.label}
                        {it.days ? <span className="g-muted"> · {it.days} days</span> : null}
                      </li>
                    ))}
                  </ul>
                  <div className="g-between g-package__foot">
                    <span className="g-package__price">{formatCents(p.price_cents)}</span>
                    {asBrand && p.active && !isMe ? (
                      <Button variant="primary" size="sm" onClick={() => { setNote(''); setBooking(p); }}>book</Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      {booking && asBrand ? (
        <ActionDialog
          onClose={() => setBooking(null)}
          pending={book.isPending}
          title={`Book ${booking.title}`}
          description={`${asBrand.name} offers ${c.display_name} ${formatCents(booking.price_cents)} for this package. ${c.display_name} has ${OFFER_HOURS} hours to accept; then you fund escrow.`}
          action={<>book for {formatCents(booking.price_cents)}</>}
          onAction={() =>
            book.mutate(
              { brandId: asBrand.id, packageId: booking.id, priceCents: booking.price_cents, note },
              { onSuccess: (offerId) => navigate(`/offers/${offerId}`) },
            )
          }
        >
          <TextAreaField label="A note for the creator (optional)" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Dates, talking points, anything they should know" />
        </ActionDialog>
      ) : null}

      {writing && asBrand ? (
        <ActionDialog
          onClose={() => setWriting(false)}
          pending={start.isPending}
          title={`Message ${c.display_name}`}
          action="send"
          disabled={!message.trim()}
          onAction={() =>
            start.mutate(
              { brandId: asBrand.id, creatorId: c.id, as: 'brand', body: message.trim() },
              { onSuccess: (conversationId) => navigate(`/messages/${conversationId}`) },
            )
          }
        >
          <TextAreaField label="Message" value={message} maxLength={4000} onChange={(e) => setMessage(e.target.value)} autoFocus />
        </ActionDialog>
      ) : null}
    </div>
  );
}
