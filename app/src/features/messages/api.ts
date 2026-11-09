import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { maybe, must, one } from '@/lib/db';
import { affected, keys, scopes } from '@/lib/keys';
import { supabase } from '@/lib/supabase';
import { seatColumn, type Seat, type Side } from '@/lib/types';

const CONVERSATION =
  'id, brand_id, creator_id, created_at, last_message_at, last_message_seq, brand:brands(id, name, slug), creator:creators(id, display_name, handle), conversation_reads(side, last_read_seq, last_read_at)';

async function fetchConversations(seat: Seat) {
  return must(
    supabase
      .from('conversations')
      .select(CONVERSATION)
      .eq(seatColumn(seat), seat.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100),
  );
}
export type ConversationListRow = Awaited<ReturnType<typeof fetchConversations>>[number];

export function useConversations(seat: Seat) {
  return useQuery({ queryKey: keys.conversations(seat), queryFn: () => fetchConversations(seat) });
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

const THREAD_LIMIT = 200;

async function fetchThread(conversationId: string) {
  const [conversation, rows] = await Promise.all([
    one(supabase.from('conversations').select(CONVERSATION).eq('id', conversationId).maybeSingle(), 'That conversation'),
    must(supabase.from('conversation_timeline').select('*').eq('conversation_id', conversationId).order('at', { ascending: false }).limit(THREAD_LIMIT)),
  ]);
  return { conversation, timeline: rows.reverse() };
}
export type Thread = Awaited<ReturnType<typeof fetchThread>>;

/** A conversation: its last 200 lines (messages and the deal's events), oldest first. */
export function useThread(conversationId: string | undefined) {
  return useQuery({ queryKey: keys.thread(conversationId ?? 'none'), queryFn: () => fetchThread(conversationId!), enabled: !!conversationId });
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
    { invalidate: () => [scopes.conversations, scopes.todos], success: 'Message sent.' },
  );
}

export async function markRead(conversationId: string, as: Side, uptoSeq: number): Promise<void> {
  await must(supabase.rpc('mark_read', { p_conversation: conversationId, p_as: as, p_upto_seq: uptoSeq }));
}
