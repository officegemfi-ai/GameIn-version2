import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { maybe, must, one } from '@/lib/db';
import { affected, keys, scopes } from '@/lib/keys';
import { pageRange, usePagedList } from '@/lib/paging';
import { supabase } from '@/lib/supabase';
import { seatColumn, type Seat, type Side } from '@/lib/types';

const CONVERSATION =
  'id, brand_id, creator_id, created_at, last_message_at, last_message_seq, brand:brands(id, name, slug), creator:creators(id, display_name, handle), conversation_reads(side, last_read_seq, last_read_at)';

async function fetchConversationsPage(seat: Seat, page: number) {
  const [from, to] = pageRange(page);
  return must(
    supabase
      .from('conversations')
      .select(CONVERSATION)
      .eq(seatColumn(seat), seat.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to),
  );
}
export type ConversationListRow = Awaited<ReturnType<typeof fetchConversationsPage>>[number];

/** This seat's conversations, the latest first, a page at a time. */
export function useConversations(seat: Seat) {
  return usePagedList(keys.conversations(seat), (page) => fetchConversationsPage(seat, page));
}

/** How far a side has read a conversation. */
export const readSeq = (c: Pick<ConversationListRow, 'conversation_reads'>, side: Side): number =>
  c.conversation_reads.find((r) => r.side === side)?.last_read_seq ?? 0;

/** Messages from the other side this side hasn't opened yet. */
export const isUnread = (c: ConversationListRow, side: Side): boolean => c.last_message_seq > readSeq(c, side);

/** The conversation between a brand and a creator, if they have one (its id). */
export function useConversationWith(brandId: string | null, creatorId: string | null) {
  return useQuery({
    queryKey: keys.conversationWith(brandId, creatorId),
    queryFn: async () => (await maybe(supabase.from('conversations').select('id').eq('brand_id', brandId!).eq('creator_id', creatorId!).maybeSingle()))?.id ?? null,
    enabled: !!brandId && !!creatorId,
  });
}

/** How many lines a thread opens with, and how many more "show earlier" brings each time. */
export const THREAD_LINES = 200;

async function fetchThread(conversationId: string, lines: number) {
  const [conversation, rows] = await Promise.all([
    one(supabase.from('conversations').select(CONVERSATION).eq('id', conversationId).maybeSingle(), 'That conversation'),
    // newest first, so the limit keeps the newest; "ref" settles the order of two lines saved at the same instant
    must(supabase.from('conversation_timeline').select('*').eq('conversation_id', conversationId).order('at', { ascending: false }).order('ref', { ascending: false }).limit(lines)),
  ]);
  // as many lines as were asked for: there may be earlier ones
  return { conversation, timeline: rows.reverse(), earlier: rows.length === lines };
}
export type Thread = Awaited<ReturnType<typeof fetchThread>>;

/**
 * What identifies a thread's newest line ('' for an empty thread). The thread view follows this to the bottom; the
 * number of lines can't be followed, because a thread shows its newest 200 (or as many as were asked for) and a new
 * line then pushes an old one out without the count changing.
 */
export function newestLineKey(timeline: Pick<Thread['timeline'][number], 'kind' | 'ref'>[]): string {
  const newest = timeline[timeline.length - 1];
  return newest ? `${newest.kind}:${newest.ref}` : '';
}

/** Where an unsent message waits (lib/drafts.ts): with its conversation, as written from one side of it. */
export const draftPlace = (conversationId: string, side: Side): string => `message:${conversationId}:${side}`;

/**
 * A conversation: its newest `lines` lines (messages and the deal's events), oldest first. Asking for more keeps what
 * is on screen there while the longer answer loads.
 */
export function useThread(conversationId: string | undefined, lines: number = THREAD_LINES) {
  return useQuery({
    queryKey: keys.thread(conversationId ?? 'none', lines),
    queryFn: () => fetchThread(conversationId!, lines),
    enabled: !!conversationId,
    placeholderData: (previous) => (previous?.conversation.id === conversationId ? previous : undefined),
  });
}

// --- moves -------------------------------------------------------------------------------------------------------
async function sendMessage(v: { brandId: string; creatorId: string; as: Side; body: string }) {
  return must(supabase.rpc('send_message', { p_brand: v.brandId, p_creator: v.creatorId, p_as: v.as, p_body: v.body }));
}

export function useSendMessage(conversationId?: string) {
  return useAction(sendMessage, { invalidate: () => affected.thread(conversationId ?? null) });
}

/** The first message to someone: sends it, then finds the conversation it opened. */
export function useStartConversation() {
  return useAction(
    async (v: { brandId: string; creatorId: string; as: Side; body: string }) => {
      await sendMessage(v);
      const c = await one(supabase.from('conversations').select('id').eq('brand_id', v.brandId).eq('creator_id', v.creatorId).maybeSingle(), 'The conversation');
      return c.id;
    },
    { invalidate: () => [scopes.conversations, ...affected.waiting()], success: 'Message sent.' },
  );
}

export async function markRead(conversationId: string, as: Side, uptoSeq: number): Promise<void> {
  await must(supabase.rpc('mark_read', { p_conversation: conversationId, p_as: as, p_upto_seq: uptoSeq }));
}
