import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Thread } from './api';

// one message on its way at a time, answered by the test
const sent: { body: string; fail: () => void; land: () => void }[] = [];
let pending = false;
let rerender = () => {};

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  useSendMessage: () => ({
    isPending: pending,
    mutate: (v: { body: string }, o?: { onError?: () => void; onSuccess?: () => void }) => {
      pending = true;
      const done = (cb?: () => void) => () => {
        pending = false;
        cb?.();
        rerender();
      };
      sent.push({ body: v.body, fail: done(o?.onError), land: done(o?.onSuccess) });
      rerender();
    },
  }),
}));

const { Composer } = await import('./MessagesPage');

const thread = {
  conversation: { id: 'c1', brand_id: 'b1', creator_id: 'k1', brand: { id: 'b1', name: 'HYPERCORE', slug: 'hypercore' }, creator: { id: 'k1', display_name: 'Testy', handle: 'testy' }, conversation_reads: [], last_message_seq: 0, last_message_at: null, created_at: '' },
  timeline: [],
} as unknown as Thread;

function mount() {
  const view = render(<Composer thread={thread} side="brand" />);
  rerender = () => view.rerender(<Composer thread={thread} side="brand" />);
  return screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Message Testy' });
}

beforeEach(() => {
  sent.length = 0;
  pending = false;
});
afterEach(cleanup);

describe('the message box', () => {
  it('empties as the message leaves, and keeps what is typed while it’s on its way', () => {
    const box = mount();
    fireEvent.change(box, { target: { value: 'first message' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(sent.map((m) => m.body)).toEqual(['first message']);
    expect(box.value).toBe('');
    fireEvent.change(box, { target: { value: 'second, typed while the first is still sending' } });
    act(() => sent[0].land());
    // emptying the box when the answer came back wiped the second message
    expect(box.value).toBe('second, typed while the first is still sending');
  });

  it('puts a message that didn’t arrive back in the box, ahead of anything typed since', () => {
    const box = mount();
    fireEvent.change(box, { target: { value: 'are you there?' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    act(() => sent[0].fail());
    expect(box.value).toBe('are you there?');

    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.change(box, { target: { value: 'hello?' } });
    act(() => sent[1].fail());
    expect(box.value).toBe('are you there?\nhello?');
  });

  it('sends on Enter, not on Shift+Enter, and never while a word is still being composed', () => {
    const box = mount();
    fireEvent.change(box, { target: { value: 'こんに' } });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true }); // Enter picks the word in a Japanese input method
    fireEvent.keyDown(box, { key: 'Enter', keyCode: 229 }); // the same, as older browsers report it
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(sent).toEqual([]);
    expect(box.value).toBe('こんに');
    fireEvent.change(box, { target: { value: 'こんにちは' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(sent.map((m) => m.body)).toEqual(['こんにちは']);
  });

  it('sends one message at a time, and nothing empty', () => {
    const box = mount();
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(sent).toEqual([]);
    fireEvent.change(box, { target: { value: 'one' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.change(box, { target: { value: 'two' } });
    fireEvent.keyDown(box, { key: 'Enter' }); // the first is still on its way: this one waits in the box
    expect(sent.map((m) => m.body)).toEqual(['one']);
    expect(box.value).toBe('two');
  });
});
