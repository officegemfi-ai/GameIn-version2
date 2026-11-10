import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ProofRow } from '@/lib/types';
import { forgetUndoWindows, noteApproval } from './undoWindow';

type Answer = (o?: { onError?: (e: unknown) => void }) => void;
const answers: Answer[] = [];
const finalize = vi.fn((_v: unknown, o?: { onError?: (e: unknown) => void }) => (answers.shift() ?? (() => {}))(o));
const undo = vi.fn();

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  useFinalizeRelease: () => ({ mutate: finalize, isPending: false }),
  useUndoApproval: () => ({ mutate: undo, isPending: false }),
}));

const { ReleaseTimer } = await import('./Proof');

const notYet: Answer = (o) => o?.onError?.({ code: 'P0001', hint: 'P2', message: 'The undo window hasn’t ended yet' });
const undone: Answer = (o) => o?.onError?.({ code: 'P0001', hint: 'P3', message: 'This proof isn’t approved' });
const offline: Answer = (o) => o?.onError?.({ message: 'TypeError: Failed to fetch', status: 0 });

const START = Date.parse('2026-11-09T12:00:00Z');
/** A proof approved "now" by the database, releasing in six seconds. */
const releasing = (id = 'p1') => ({ id, status: 'releasing', approved_at: new Date(START).toISOString(), release_at: new Date(START + 6000).toISOString() }) as ProofRow;
const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers({ now: START });
  forgetUndoWindows();
  answers.length = 0;
  finalize.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the undo window on a deal page', () => {
  it('offers undo for six seconds from the approval this browser made, then asks for the release', async () => {
    noteApproval('p1', releasing().release_at!, START, START + 200);
    render(<ReleaseTimer dealId="d1" proof={releasing()} canUndo />);
    expect(screen.getByText('Releasing in 6s')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'undo' })).toBeTruthy();
    await tick(5900);
    expect(screen.getByText('Releasing in 1s')).toBeTruthy();
    expect(finalize).not.toHaveBeenCalled();
    await tick(700); // 6.6 s: past the window (six seconds after the answer came back, and a little)
    expect(screen.getByText('Releasing…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'undo' })).toBeNull();
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(finalize.mock.calls[0][0]).toEqual({ dealId: 'd1', proofId: 'p1' });
  });

  it('counts the same on a device whose clock is half a minute fast', async () => {
    vi.setSystemTime(START + 30_000); // this device's idea of "now" when the database approved
    noteApproval('p1', releasing().release_at!, START + 30_000, START + 30_200);
    render(<ReleaseTimer dealId="d1" proof={releasing()} canUndo />);
    // by subtraction the window ended 24 seconds ago: no undo at all, and a release asked for at once and refused
    expect(screen.getByText('Releasing in 6s')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'undo' })).toBeTruthy();
    await tick(1000);
    expect(finalize).not.toHaveBeenCalled();
  });

  it('asks again each second when the database says the window hasn’t ended, until it has', async () => {
    answers.push(notYet, notYet); // this device's guess ran two seconds ahead of the database
    vi.setSystemTime(START + 30_000); // a fast clock, and no approval noted: the creator's side, or after a reload
    render(<ReleaseTimer dealId="d1" proof={releasing()} canUndo={false} />);
    expect(screen.getByText('Releasing…')).toBeTruthy();
    await tick(400);
    expect(finalize).toHaveBeenCalledTimes(1);
    await tick(1000);
    expect(finalize).toHaveBeenCalledTimes(2);
    await tick(1000);
    expect(finalize).toHaveBeenCalledTimes(3); // this one is accepted
    await tick(10_000);
    expect(finalize).toHaveBeenCalledTimes(3);
  });

  it('never shows more than the window on a slow clock', async () => {
    vi.setSystemTime(START - 30_000);
    render(<ReleaseTimer dealId="d1" proof={releasing()} canUndo />);
    expect(screen.getByText('Releasing in 6s')).toBeTruthy(); // not "Releasing in 36s"
    await tick(6400);
    expect(finalize).toHaveBeenCalledTimes(1);
  });

  it('stops asking when the approval was undone, and when the page is left', async () => {
    answers.push(undone);
    noteApproval('p1', releasing().release_at!, START, START + 100);
    const first = render(<ReleaseTimer dealId="d1" proof={releasing()} canUndo />);
    await tick(6500);
    expect(finalize).toHaveBeenCalledTimes(1);
    await tick(20_000);
    expect(finalize).toHaveBeenCalledTimes(1);
    first.unmount();

    answers.push(notYet, notYet, notYet);
    noteApproval('p2', releasing('p2').release_at!, Date.now() - 6000, Date.now() - 6000);
    const second = render(<ReleaseTimer dealId="d1" proof={releasing('p2')} canUndo />);
    await tick(400);
    expect(finalize).toHaveBeenCalledTimes(2);
    second.unmount();
    await tick(10_000);
    expect(finalize).toHaveBeenCalledTimes(2);
  });

  it('tries a few more times when the request itself fails, then leaves it to the scheduler', async () => {
    answers.push(offline, offline, offline, offline, offline, offline, offline, offline);
    noteApproval('p1', releasing().release_at!, START - 6000, START - 6000);
    render(<ReleaseTimer dealId="d1" proof={releasing()} canUndo />);
    await tick(120_000);
    expect(finalize).toHaveBeenCalledTimes(6);
  });
});
