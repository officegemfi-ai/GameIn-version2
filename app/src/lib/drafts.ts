import { useCallback, useSyncExternalStore } from 'react';

// What someone has typed and not sent yet, kept by the place it was typed for (a conversation, from one seat) for as
// long as the app is open.
//
// A box that keeps its text in its own state shares it with whatever that box shows next: the message box stayed on
// screen from one conversation to the next, so a message written for one brand was sitting in another brand's box,
// one Enter from being sent there. Kept here by place, each place has its own text: it can't follow the person
// somewhere else, and it is still there when they come back.

const drafts = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** What's waiting in a place ('' for nothing). */
export const draftOf = (place: string): string => drafts.get(place) ?? '';

export function setDraft(place: string, text: string): void {
  if (text === draftOf(place)) return;
  if (text) drafts.set(place, text);
  else drafts.delete(place);
  listeners.forEach((l) => l());
}

/**
 * Something that was sent from a place and didn't arrive goes back there, ahead of anything typed since. It works
 * whether or not the place is on screen: the text waits until the person is back.
 */
export function restoreDraft(place: string, body: string): void {
  const typed = draftOf(place);
  setDraft(place, typed.trim() ? `${body}\n${typed}` : body);
}

/** Signed out: nothing typed by one person is left for the next one on this device. */
export function forgetDrafts(): void {
  if (drafts.size === 0) return;
  drafts.clear();
  listeners.forEach((l) => l());
}

/** The text of one place and how to change it, like useState, except that it stays with the place. */
export function useDraft(place: string): [string, (text: string) => void] {
  const text = useSyncExternalStore(subscribe, () => draftOf(place));
  const set = useCallback((next: string) => setDraft(place, next), [place]);
  return [text, set];
}
