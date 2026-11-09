import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, HexAvatar, Icon, Loading, QueryError, TimeAgo } from '@/components/ui';
import { keys } from '@/lib/keys';
import { messageTime } from '@/lib/time';
import { otherSide, type Side } from '@/lib/types';
import { useSeat } from '@/features/seats/SeatProvider';
import { describeEvent } from '@/features/notifications/describe';
import { isUnread, markRead, readSeq, useConversations, useSendMessage, useThread, type ConversationListRow, type Thread } from './api';

function otherName(c: Pick<ConversationListRow, 'brand' | 'creator'>, side: Side): string {
  return side === 'brand' ? c.creator?.display_name ?? 'Creator' : c.brand?.name ?? 'Brand';
}

function ConversationList({ rows, activeId, side }: { rows: ConversationListRow[]; activeId?: string; side: Side }) {
  if (rows.length === 0) {
    return <Empty title="No conversations yet">A conversation starts with an offer or a message from a creator’s page.</Empty>;
  }
  return (
    <nav className="g-list" aria-label="Conversations">
      {rows.map((c) => {
        const name = otherName(c, side);
        const unread = isUnread(c, side);
        return (
          <Link key={c.id} to={`/messages/${c.id}`} className={`g-item g-conv${c.id === activeId ? ' is-active' : ''}`} aria-current={c.id === activeId ? 'page' : undefined}>
            <HexAvatar name={name} size={38} brand={side === 'creator'} />
            <span className="g-item__main">
              <span className="g-item__title">{name}</span>
              <span className="g-item__sub">{c.last_message_at ? <TimeAgo at={c.last_message_at} /> : 'no messages yet'}</span>
            </span>
            {unread ? <span className="g-dot" aria-label="unread" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Timeline({ thread, side }: { thread: Thread; side: Side }) {
  const c = thread.conversation;
  const names = { brand: c.brand?.name ?? 'The brand', creator: c.creator?.display_name ?? 'The creator' };
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [thread.timeline.length]);
  const lastMine = [...thread.timeline].reverse().find((r) => r.kind === 'message' && r.side === side);
  const lastAny = [...thread.timeline].reverse().find((r) => r.kind === 'message');
  const seen = lastMine && lastAny === lastMine && readSeq(c, otherSide(side)) >= c.last_message_seq;
  return (
    <div className="g-thread" aria-live="polite">
      {thread.timeline.length === 0 ? <p className="g-muted g-small" style={{ textAlign: 'center' }}>Say hello.</p> : null}
      {thread.timeline.map((r) =>
        r.kind === 'message' ? (
          <div key={'m' + r.ref} className={`g-bubble${r.side === side ? ' is-mine' : ''}`}>
            <p className="g-pre">{r.body}</p>
            <span className="g-bubble__time">{r.at ? messageTime(r.at) : ''}</span>
          </div>
        ) : (
          <EventLine key={'e' + r.ref} row={r} names={names} side={side} />
        ),
      )}
      {seen ? <span className="g-thread__seen">seen</span> : null}
      <div ref={end} />
    </div>
  );
}

function EventLine({ row, names, side }: { row: Thread['timeline'][number]; names: { brand: string; creator: string }; side: Side }) {
  const { text, to } = describeEvent(
    { kind: row.kind ?? '', data: row.data, amount_cents: row.amount_cents, deal_id: row.deal_id, offer_id: row.offer_id, side: row.side },
    names,
    side,
  );
  return (
    <div className="g-eventline">
      <span>{to ? <Link to={to}>{text}</Link> : text}</span>
      <span className="g-tiny g-faint">{row.at ? messageTime(row.at) : ''}</span>
    </div>
  );
}

function Composer({ thread, side }: { thread: Thread; side: Side }) {
  const c = thread.conversation;
  const [text, setText] = useState('');
  const send = useSendMessage(c.id);
  const name = otherName(c, side);
  const submit = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    send.mutate({ brandId: c.brand_id, creatorId: c.creator_id, as: side, body }, { onSuccess: () => setText('') });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <div className="g-composer">
      <textarea
        className="g-textarea"
        rows={1}
        aria-label={`Message ${name}`}
        placeholder={`Message ${name}`}
        value={text}
        maxLength={4000}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
      />
      <Button variant="primary" icon="send" loading={send.isPending} disabled={!text.trim()} onClick={submit} aria-label="Send">
        <span className="g-composer__label">send</span>
      </Button>
    </div>
  );
}

export default function MessagesPage() {
  const { id } = useParams();
  const seat = useSeat();
  const list = useConversations(seat);
  const thread = useThread(id);
  const queryClient = useQueryClient();
  const rows = useMemo(() => list.data ?? [], [list.data]);

  // opening a thread marks it read for this seat, up to the last message shown
  const conv = thread.data?.conversation;
  const lastSeq = conv?.last_message_seq ?? 0;
  const myRead = conv ? readSeq(conv, seat.side) : 0;
  const convId = conv?.id;
  useEffect(() => {
    if (!convId || lastSeq <= myRead) return;
    void markRead(convId, seat.side, lastSeq).then(() => {
      void queryClient.invalidateQueries({ queryKey: keys.conversations(seat) });
      void queryClient.invalidateQueries({ queryKey: keys.todos(seat) });
    });
  }, [convId, lastSeq, myRead, seat, queryClient]);

  const partyMismatch = conv && (seat.side === 'brand' ? conv.brand_id !== seat.id : conv.creator_id !== seat.id);

  return (
    <div className={`g-page g-messages${id ? ' has-thread' : ''}`}>
      <div className="g-messages__grid">
        <Card flush className="g-messages__list">
          <div className="g-messages__head">
            <h1>Messages</h1>
          </div>
          {list.isPending ? <Loading /> : list.isError ? <QueryError query={list} /> : <ConversationList rows={rows} activeId={id} side={seat.side} />}
        </Card>
        <Card flush className="g-messages__thread">
          {!id ? (
            <Empty title="Choose a conversation">Offers, payments and proof show up in the thread too.</Empty>
          ) : thread.isPending ? (
            <Loading />
          ) : thread.isError ? (
            <div style={{ padding: 16 }}>
              <QueryError query={thread} />
            </div>
          ) : partyMismatch ? (
            <Empty title="This conversation belongs to another seat">Switch seats from the top bar to reply as the other side.</Empty>
          ) : (
            <>
              <div className="g-messages__head g-row">
                <Link to="/messages" className="g-btn g-btn--ghost g-btn--icon g-btn--sm g-messages__back" aria-label="All conversations">
                  <Icon name="chevronLeft" />
                </Link>
                <HexAvatar name={otherName(thread.data.conversation, seat.side)} size={34} brand={seat.side === 'creator'} />
                <div className="g-item__main">
                  <h2 className="g-item__title">{otherName(thread.data.conversation, seat.side)}</h2>
                  {seat.side === 'brand' && thread.data.conversation.creator ? (
                    <Link className="g-tiny" to={`/c/${thread.data.conversation.creator.handle}`}>view profile</Link>
                  ) : null}
                </div>
              </div>
              <Timeline thread={thread.data} side={seat.side} />
              <Composer thread={thread.data} side={seat.side} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
