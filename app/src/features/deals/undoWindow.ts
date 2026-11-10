// The undo window after a brand approves proof, as this browser sees it.
//
// The database decides the window: approve_proof stamps the proof with approved_at (its own clock) and release_at
// (approved_at plus UNDO_SECONDS); undo works until release_at, the release works from it. Those are moments on the
// database's clock. A phone or laptop clock is often seconds or minutes off, so "release_at minus the time here" can
// be anything: a clock half a minute fast showed no undo at all, one half a minute slow showed "Releasing in 36s".
//
// So the countdown never compares the two clocks when it can avoid it. Each window is kept as two moments on THIS
// device's clock, both worked out from things this device saw happen:
//   undoUntil     offer undo until here
//   releaseFrom   ask the database to release from here
import { UNDO_SECONDS } from '@/lib/rules';
import type { ProofRow } from '@/lib/types';

export interface UndoWindow {
  /** The database's release moment: which approval this window belongs to (approving again makes a new one). */
  releaseAt: number;
  undoUntil: number;
  releaseFrom: number;
}

const windows = new Map<string, UndoWindow>();

/** Forget windows long over (a page left open for days approves many proofs). */
function prune(now: number) {
  for (const [id, w] of windows) if (now - w.releaseFrom > 10 * 60_000) windows.delete(id);
}

/**
 * This browser just approved a proof: the request left at `sentAt` and the answer (the database's release moment) came
 * back at `answeredAt`, both on this device's clock. The database started its window somewhere in between, so undo is
 * offered for `seconds` from when the request left (never longer than the database allows) and the release is asked
 * for `seconds` after the answer came back (never before the database is ready).
 */
export function noteApproval(proofId: string, releaseAt: string, sentAt: number, answeredAt: number, seconds: number = UNDO_SECONDS): UndoWindow {
  prune(answeredAt);
  const w = { releaseAt: Date.parse(releaseAt), undoUntil: sentAt + seconds * 1000, releaseFrom: answeredAt + seconds * 1000 };
  windows.set(proofId, w);
  return w;
}

/**
 * The window of a proof that is releasing, or null when it isn't. For an approval this browser made, that is the one
 * noted above. Otherwise it's the first this browser sees of it (the creator's side, another device, a reload): the
 * two clocks have to be compared once, and the answer is trusted only as far as the database's own numbers allow,
 * between nothing left and the whole window (release_at minus approved_at). From then on it counts down on this
 * device's clock alone.
 */
export function undoWindow(proof: Pick<ProofRow, 'id' | 'approved_at' | 'release_at'>, now: number = Date.now()): UndoWindow | null {
  if (!proof.release_at) return null;
  const releaseAt = Date.parse(proof.release_at);
  const known = windows.get(proof.id);
  if (known && known.releaseAt === releaseAt) return known;
  const whole = proof.approved_at ? Math.max(0, releaseAt - Date.parse(proof.approved_at)) : UNDO_SECONDS * 1000;
  const left = Math.min(Math.max(releaseAt - now, 0), whole);
  prune(now);
  const w = { releaseAt, undoUntil: now + left, releaseFrom: now + left };
  windows.set(proof.id, w);
  return w;
}

/** For tests: start with nothing noted. */
export function forgetUndoWindows(): void {
  windows.clear();
}
