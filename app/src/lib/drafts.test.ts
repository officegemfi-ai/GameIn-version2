import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { draftOf, forgetDrafts, restoreDraft, setDraft, useDraft } from './drafts';

afterEach(forgetDrafts);

describe('unsent text, kept by the place it was typed for', () => {
  it('keeps each place’s text apart', () => {
    setDraft('message:c1:brand', 'for the first');
    setDraft('message:c2:brand', 'for the second');
    expect(draftOf('message:c1:brand')).toBe('for the first');
    expect(draftOf('message:c2:brand')).toBe('for the second');
    expect(draftOf('message:c1:creator')).toBe('');
    setDraft('message:c1:brand', '');
    expect(draftOf('message:c1:brand')).toBe('');
    expect(draftOf('message:c2:brand')).toBe('for the second');
  });

  it('puts back what didn’t arrive, ahead of anything typed since', () => {
    restoreDraft('message:c1:brand', 'first');
    expect(draftOf('message:c1:brand')).toBe('first');
    setDraft('message:c2:brand', 'typed since');
    restoreDraft('message:c2:brand', 'sent before');
    expect(draftOf('message:c2:brand')).toBe('sent before\ntyped since');
    setDraft('message:c3:brand', '   ');
    restoreDraft('message:c3:brand', 'only this'); // blank space isn't something typed
    expect(draftOf('message:c3:brand')).toBe('only this');
  });

  it('shows a box its place’s text, and follows it when it changes from elsewhere', () => {
    const { result, rerender } = renderHook(({ place }) => useDraft(place), { initialProps: { place: 'message:c1:brand' } });
    expect(result.current[0]).toBe('');
    act(() => result.current[1]('typed here'));
    expect(result.current[0]).toBe('typed here');
    act(() => restoreDraft('message:c1:brand', 'came back')); // a send that failed while the box was on screen
    expect(result.current[0]).toBe('came back\ntyped here');
    rerender({ place: 'message:c2:brand' }); // the same box, now for another conversation
    expect(result.current[0]).toBe('');
    rerender({ place: 'message:c1:brand' });
    expect(result.current[0]).toBe('came back\ntyped here');
  });

  it('forgets everything when the person signs out', () => {
    const { result } = renderHook(() => useDraft('message:c1:brand'));
    act(() => result.current[1]('not for the next person on this device'));
    act(() => forgetDrafts());
    expect(result.current[0]).toBe('');
    expect(draftOf('message:c1:brand')).toBe('');
  });
});
