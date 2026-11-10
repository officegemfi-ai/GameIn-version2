import { useQuery } from '@tanstack/react-query';
import { must } from '@/lib/db';
import { keys } from '@/lib/keys';
import { BELL_EVERY } from '@/lib/queryClient';
import { liveState } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';

const SELECT =
  'id, kind, created_at, read_at, event:events(kind, data, amount_cents, deal_id, offer_id, actor_side, brand_id, creator_id, brand:brands(name), creator:creators(display_name))';

async function fetchNotifications() {
  return must(supabase.from('notifications').select(SELECT).order('id', { ascending: false }).limit(30));
}

export type NotificationItem = Awaited<ReturnType<typeof fetchNotifications>>[number];

/**
 * The person's latest notifications. Also the safety net under Realtime: checked on a timer, and the bell refreshes
 * the screen on show when a newer one turns up (NotificationBell). The timer is short while Realtime is down, when
 * this is the only way news arrives, and long while it's up (BELL_EVERY): asked every 30 seconds by every open tab it
 * was the most frequent request there is, nearly always to hear "nothing new".
 */
export function useNotifications(userId: string) {
  return useQuery({
    queryKey: keys.notifications(userId),
    queryFn: fetchNotifications,
    refetchInterval: () => (liveState.get() === 'live' ? BELL_EVERY.whileLive : BELL_EVERY.otherwise),
  });
}

export async function markNotificationsRead(ids?: number[]): Promise<number> {
  return must(supabase.rpc('mark_notifications_read', ids ? { p_ids: ids } : {}));
}
