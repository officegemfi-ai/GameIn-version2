import { useState, type ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router';
import type { Seat } from '@/lib/types';

let seat: Seat | null = { side: 'creator', id: 'k1', name: 'Instant Shock', role: null };
vi.mock('@/features/seats/SeatProvider', () => ({ useSeats: () => ({ seat }) }));

const { startOverFor } = await import('./startOver');

/** A deal page in miniature: a rating being written, and a sheet that can be open. */
function DealPage() {
  const { id } = useParams();
  const [comment, setComment] = useState('');
  const [declining, setDeclining] = useState(false);
  return (
    <div>
      <h1>Deal {id}</h1>
      <textarea aria-label="A few words" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button onClick={() => setDeclining(true)}>decline</button>
      {declining ? <div role="dialog">Decline deal {id}?</div> : null}
    </div>
  );
}

function open(Page: ComponentType) {
  const router = createMemoryRouter([{ path: 'deals/:id', Component: Page }], { initialEntries: ['/deals/a'] });
  render(<RouterProvider router={router} />);
  return router;
}
const comment = () => screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'A few words' });

afterEach(() => {
  cleanup();
  seat = { side: 'creator', id: 'k1', name: 'Instant Shock', role: null };
});

describe('a page about one thing', () => {
  it('as the router leaves it: what was typed and opened for one deal is on the next deal’s page', async () => {
    // not what the app does any more, but why it does what it does: this is React Router's own behaviour
    const router = open(DealPage);
    fireEvent.change(comment(), { target: { value: 'paid three weeks late' } });
    fireEvent.click(screen.getByRole('button', { name: 'decline' }));
    await act(() => router.navigate('/deals/b'));
    expect(screen.getByRole('heading').textContent).toBe('Deal b');
    expect(comment().value).toBe('paid three weeks late');
    expect(screen.getByRole('dialog').textContent).toBe('Decline deal b?');
  });

  it('starts over for each one: nothing typed or opened for the last deal is on this one', async () => {
    const router = open(startOverFor(DealPage, 'id'));
    fireEvent.change(comment(), { target: { value: 'paid three weeks late' } });
    fireEvent.click(screen.getByRole('button', { name: 'decline' }));
    await act(() => router.navigate('/deals/b')); // a notification about another deal
    expect(screen.getByRole('heading').textContent).toBe('Deal b');
    expect(comment().value).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'decline' }));
    await act(() => router.navigate(-1)); // the phone's Back, with the sheet open
    expect(screen.getByRole('heading').textContent).toBe('Deal a');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps what is typed while the address only moves within the same deal', async () => {
    const router = open(startOverFor(DealPage, 'id'));
    fireEvent.change(comment(), { target: { value: 'still writing' } });
    await act(() => router.navigate('/deals/a#proof-1'));
    await act(() => router.navigate('/deals/a?tab=payments'));
    expect(comment().value).toBe('still writing');
  });

  it('starts over when it is looked at from another seat', async () => {
    const router = open(startOverFor(DealPage, 'id'));
    fireEvent.change(comment(), { target: { value: 'written as the creator' } });
    seat = { side: 'brand', id: 'b1', name: 'HYPERCORE', role: 'owner' };
    await act(() => router.navigate('/deals/a', { replace: true })); // anything that shows the page again
    expect(comment().value).toBe('');
  });
});
