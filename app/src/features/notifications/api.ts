import { useQuery } from '@tanstack/react-query';
import { must } from '@/lib/db';
import { keys } from '@/lib/keys';
import { supabase } from '@/lib/supabase';

const SELECT =
  'id, kind, created_at, read_at, event:events(kind, data, amount_cents, deal_id, offer_id, actor_side, brand:brands(name), creator:creators(display_name))';

async function fetchNotifications() {
  return must(supabase.from('notifications').select(SELECT).order('id', { ascending: false }).limit(30));
}

export type NotificationItem = Awaited<ReturnType<typeof fetchNotifications>>[number];

/**
 * The person's latest notifications. Also the safety net under Realtime: checked every 30 seconds, and the bell
 * refreshes the screen on show when a newer one turns up (NotificationBell).
 */
export function useNotifications(userId: string) {
  return useQuery({ queryKey: keys.notifications(userId), queryFn: fetchNotifications, refetchInterval: 30_000 });
}

export async function markNotificationsRead(ids?: number[]): Promise<number> {
  return must(supabase.rpc('mark_notifications_read', ids ? { p_ids: ids } : {}));
}
