import { beforeEach, describe, expect, it } from 'vitest';
import { forgetUndoWindows, noteApproval, undoWindow } from './undoWindow';

// The database approved at 12:00:00 and releases at 12:00:06 (its own clock).
const APPROVED = '2026-11-09T12:00:00.250000+00:00';
const RELEASE = '2026-11-09T12:00:06.250000+00:00';
const proof = { id: 'p1', approved_at: APPROVED, release_at: RELEASE };
const SERVER_RELEASE = Date.parse(RELEASE);

beforeEach(() => forgetUndoWindows());

describe('the undo window, on this device’s clock', () => {
  it.each([
    ['right', 0],
    ['30 seconds fast', 30_000],
    ['30 seconds slow', -30_000],
    ['an hour slow', -3_600_000],
  ])('is the same six seconds for the brand that approved, whatever its clock says (%s)', (_label, skew) => {
    // the request left the device at 12:00:00.100 and the answer came back at 12:00:00.400, as this device tells time
    const sent = Date.parse('2026-11-09T12:00:00.100Z') + skew;
    const answered = sent + 300;
    noteApproval('p1', RELEASE, sent, answered);
    const w = undoWindow(proof, answered + 50)!;
    expect(w.undoUntil - sent).toBe(6000); // undo for six seconds from the press: never longer than the database allows
    expect(w.releaseFrom - answered).toBe(6000); // the release asked for six seconds after the answer: never early
    expect(undoWindow(proof, answered + 4000)).toBe(w); // and it doesn't move as time passes
  });

  it('never shows more than the whole window to someone who didn’t make the approval, however slow their clock', () => {
    const now = SERVER_RELEASE - 36_000; // a clock 30 s slow, looking the moment it was approved: "36 s" by subtraction
    const w = undoWindow(proof, now)!;
    expect(w.undoUntil - now).toBe(6000);
    expect(w.releaseFrom - now).toBe(6000);
  });

  it('shows nothing left on a clock that is ahead, and counts down from the first look after that', () => {
    const now = SERVER_RELEASE + 24_000; // a clock 30 s fast
    const w = undoWindow(proof, now)!;
    expect(w.undoUntil).toBe(now);
    expect(w.releaseFrom).toBe(now); // asked for at once; "not yet" from the database means ask again (ReleaseTimer)
    expect(undoWindow(proof, now + 2000)).toBe(w);
  });

  it('agrees with the database when the clock is right: three seconds in, three are left', () => {
    const now = SERVER_RELEASE - 3000;
    expect(undoWindow(proof, now)!.undoUntil - now).toBe(3000);
  });

  it('starts over when the proof is approved again, and is nothing when it isn’t releasing', () => {
    const first = undoWindow(proof, SERVER_RELEASE - 6000)!;
    const again = { id: 'p1', approved_at: '2026-11-09T12:05:00+00:00', release_at: '2026-11-09T12:05:06+00:00' };
    const second = undoWindow(again, Date.parse(again.approved_at))!;
    expect(second).not.toBe(first);
    expect(second.releaseAt).toBe(Date.parse(again.release_at));
    expect(undoWindow({ id: 'p2', approved_at: null, release_at: null })).toBeNull();
  });

  it('gives an approval made by the scheduler (no window) nothing to count', () => {
    const auto = { id: 'p3', approved_at: RELEASE, release_at: RELEASE };
    const now = SERVER_RELEASE - 30_000;
    expect(undoWindow(auto, now)!.undoUntil).toBe(now);
  });
});
