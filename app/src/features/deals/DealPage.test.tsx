import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ToastProvider } from '@/components/ui';
import type { Seat } from '@/lib/types';
import type { DealDetail } from './api';

// --- the page's surroundings, stood in for -----------------------------------------------------------------------------
const hypercore: Seat = { side: 'brand', id: 'b-hyper', name: 'HYPERCORE', role: 'owner' };
const voltedge: Seat = { side: 'brand', id: 'b-volt', name: 'VOLTEDGE', role: 'owner' };
const world = { seat: hypercore, seats: [hypercore, voltedge], setSeat: vi.fn(), deal: {} as Record<string, unknown> };

vi.mock('@/features/seats/SeatProvider', () => ({
  useSeat: () => world.seat,
  useSeats: () => ({ seat: world.seat, seats: world.seats, setSeat: world.setSeat }),
}));
vi.mock('@/features/messages/api', () => ({ useConversationWith: () => ({ data: null }) }));
vi.mock('./api', async (original) => {
  const idle = () => ({ mutate: vi.fn(), isPending: false, variables: undefined, error: null });
  return {
    ...(await original<typeof import('./api')>()),
    useDeal: () => world.deal,
    useSimulatePayment: idle, useFund: idle, useSubmitProof: idle, useApproveProof: idle, useUndoApproval: idle,
    useFinalizeRelease: idle, useRequestChanges: idle, useRateDeal: idle, useBookAgain: idle,
  };
});

const { default: DealPage } = await import('./DealPage');

/** HYPERCORE × Qwerty2000, $900 accepted and nothing funded yet. */
const deal = {
  id: 'd1', title: 'ROCKET LEAGUE CUP WEEK', status: 'awaiting_funding', type: 'one_time', amount_cents: 90000,
  brand_id: 'b-hyper', creator_id: 'c-qwerty', created_at: '2026-11-06T10:00:00+00:00', ends_on: '2026-11-15',
  brand: { id: 'b-hyper', name: 'HYPERCORE', slug: 'hypercore' },
  creator: { id: 'c-qwerty', display_name: 'Qwerty2000', handle: 'qwerty2000' },
  milestones: [{ id: 'm1', seq: 1, label: 'Cup stream with logo overlay', status: 'pending', amount_cents: 90000, released_cents: 0 }],
  deliverables: [{ id: 'dl1', seq: 1, milestone_id: 'm1', label: 'Cup stream with logo overlay', status: 'upcoming', amount_cents: 90000, due_on: '2026-11-11', done_at: null }],
  proofs: [], releases: [], ratings: [], payments: [],
  money: { deal_id: 'd1', total_cents: 90000, not_funded_cents: 90000, clearing_cents: 0, funded_cents: 0, in_escrow_cents: 0, released_cents: 0 },
} as unknown as DealDetail;

const unreachable = { message: 'TypeError: Failed to fetch', code: '', status: 0 };
const loaded = { isPending: false, isError: false, isLoadingError: false, data: deal, error: null, refetch: vi.fn() };

function show() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/deals/d1']}>
        <Routes>
          <Route path="/deals/:id" element={<DealPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  world.seat = hypercore;
  world.deal = loaded;
  world.setSeat.mockClear();
});
afterEach(cleanup);

describe('the deal page', () => {
  it('keeps a deal that has loaded on screen when a later refresh of it fails', () => {
    // a lost connection during one background refresh used to swap the whole page for an error: an open dialog, and
    // whatever had been typed into it, went with it
    world.deal = { ...loaded, isError: true, error: unreachable };
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'ROCKET LEAGUE CUP WEEK' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'fund escrow' })).toBeTruthy();
    expect(screen.queryByText(/Can’t reach GameIn/)).toBeNull();
  });

  it('says so, with a way to try again, when it couldn’t load at all', () => {
    const refetch = vi.fn();
    world.deal = { isPending: false, isError: true, isLoadingError: true, data: undefined, error: unreachable, refetch };
    show();
    expect(screen.getByText('Can’t reach GameIn. Check your connection and try again.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('from a seat that isn’t a party to it, says whose it is and offers none of its moves', () => {
    world.seat = voltedge; // the same account, acting as its other brand
    show();
    expect(screen.getByRole('heading', { name: 'This deal belongs to another of your seats' })).toBeTruthy();
    expect(screen.getByText('You’re acting as VOLTEDGE. Switch to HYPERCORE to see it and act on it.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'fund escrow' })).toBeNull(); // it used to be offered: HYPERCORE's money
    fireEvent.click(screen.getByRole('button', { name: 'switch to HYPERCORE' }));
    expect(world.setSeat).toHaveBeenCalledWith(hypercore);
  });

  it('tells someone with no seat in it that it isn’t theirs', () => {
    world.seat = voltedge;
    world.seats = [voltedge];
    show();
    expect(screen.getByRole('heading', { name: 'This deal isn’t one of yours' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /switch to/ })).toBeNull();
    world.seats = [hypercore, voltedge];
  });
});
