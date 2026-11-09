import { useQuery } from '@tanstack/react-query';
import { useAction } from '@/app/useAction';
import { itemsToJson } from '@/lib/items';
import { must, one } from '@/lib/db';
import { affected, keys, scopes } from '@/lib/keys';
import { OFFER_HOURS, PITCH_HOURS } from '@/lib/rules';
import { supabase } from '@/lib/supabase';
import { seatColumn, type Item, type Seat, type Side } from '@/lib/types';

const BOARD = '*, brand:brands(id, name, slug), creator:creators(id, display_name, handle)';

async function fetchOffers(seat: Seat) {
  return must(
    supabase
      .from('offer_board')
      .select(BOARD)
      .eq(seatColumn(seat), seat.id)
      .order('last_version_at', { ascending: false })
      .limit(200),
  );
}
export type OfferListRow = Awaited<ReturnType<typeof fetchOffers>>[number];

/** This seat's offers, newest move first (offer_board: latest terms, whose turn it is, expired at once). */
export function useOffers(seat: Seat) {
  return useQuery({ queryKey: keys.offers(seat), queryFn: () => fetchOffers(seat) });
}

async function fetchOffer(id: string) {
  const [offer, versions] = await Promise.all([
    one(supabase.from('offer_board').select(BOARD).eq('id', id).maybeSingle(), 'That offer'),
    must(supabase.from('offer_versions').select('*').eq('offer_id', id).order('version')),
  ]);
  return { offer, versions };
}
export type OfferDetail = Awaited<ReturnType<typeof fetchOffer>>;

export function useOffer(id: string) {
  return useQuery({ queryKey: keys.offer(id), queryFn: () => fetchOffer(id) });
}

// --- moves -------------------------------------------------------------------------------------------------------
// a move on an offer can open the pair's conversation, and shows in it
const offerKeys = (offerId: string) => [...affected.offer(offerId), scopes.conversations];

export function useSendOffer() {
  return useAction(
    (v: { brandId: string; creatorId: string; title: string; amountCents: number; items: Item[]; note: string }) =>
      must(supabase.rpc('send_offer', { p_brand: v.brandId, p_creator: v.creatorId, p_title: v.title, p_amount_cents: v.amountCents, p_items: itemsToJson(v.items), p_note: v.note })),
    { invalidate: (id) => offerKeys(id), success: `Offer sent. The creator has ${OFFER_HOURS} hours to answer.` },
  );
}

export function usePitchOffer() {
  return useAction(
    (v: { creatorId: string; brandId: string; packageId?: string; title: string; amountCents: number; items: Item[]; note: string }) =>
      must(
        supabase.rpc('pitch_offer', {
          p_creator: v.creatorId, p_brand: v.brandId, p_package: v.packageId, p_title: v.title, p_amount_cents: v.amountCents, p_items: itemsToJson(v.items), p_note: v.note,
        }),
      ),
    { invalidate: (id) => offerKeys(id), success: `Pitch sent. The brand has ${PITCH_HOURS} hours to answer.` },
  );
}

export function useBookPackage() {
  return useAction(
    (v: { brandId: string; packageId: string; priceCents: number; note: string }) =>
      must(supabase.rpc('book_package', { p_brand: v.brandId, p_package: v.packageId, p_note: v.note, p_expected_price_cents: v.priceCents })),
    { invalidate: (id) => offerKeys(id), success: `Booked. The creator has ${OFFER_HOURS} hours to accept.` },
  );
}

export function useCounterOffer() {
  return useAction(
    (v: { offerId: string; as: Side; amountCents: number; items: Item[]; note: string }) =>
      must(supabase.rpc('counter_offer', { p_offer: v.offerId, p_as: v.as, p_amount_cents: v.amountCents, p_items: itemsToJson(v.items), p_note: v.note })),
    { invalidate: (_r, v) => offerKeys(v.offerId), success: 'Counter-offer sent.' },
  );
}

export function useAcceptOffer() {
  return useAction(
    (v: { offerId: string; as: Side }) => must(supabase.rpc('accept_offer', { p_offer: v.offerId, p_as: v.as })),
    { invalidate: (_r, v) => [...offerKeys(v.offerId), scopes.deals], success: 'Accepted. The deal is on.' },
  );
}

export function useDeclineOffer() {
  return useAction(
    (v: { offerId: string; as: Side; reason: string }) => must(supabase.rpc('decline_offer', { p_offer: v.offerId, p_as: v.as, p_reason: v.reason })),
    { invalidate: (_r, v) => offerKeys(v.offerId), success: 'Offer declined.' },
  );
}

export function useWithdrawOffer() {
  return useAction(
    (v: { offerId: string; as: Side }) => must(supabase.rpc('withdraw_offer', { p_offer: v.offerId, p_as: v.as })),
    { invalidate: (_r, v) => offerKeys(v.offerId), success: 'Offer withdrawn.' },
  );
}
