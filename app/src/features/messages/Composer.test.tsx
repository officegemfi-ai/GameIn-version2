import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forgetDrafts } from '@/lib/drafts';
import type { Side } from '@/lib/types';
import type { Thread } from './api';

// messages on their way, answered by the test (one at a time per conversation, as the real hook has it)
const sent: { to: string; body: string; fail: () => Promise<void>; land: () => Promise<void> }[] = [];
const sending = new Set<string>();
let rerender = () => {};

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  useSendMessage: (conversationId: string) => ({
    isPending: sending.has(conversationId),
    mutateAsync: (v: { body: string }) =>
      new Promise<void>((resolve, reject) => {
        sending.add(conversationId);
        const settle = (how: () => void) => () =>
          act(async () => {
            sending.delete(conversationId);
            how();
            await Promise.resolve();
            rerender();
          });
        sent.push({ to: conversationId, body: v.body, land: settle(resolve), fail: settle(() => reject(new Error('Failed to fetch'))) });
        rerender();
      }),
  }),
}));

const { Composer } = await import('./MessagesPage');
const { draftPlace } = await import('./api');

const conversation = (id: string, creator: string) =>
  ({
    conversation: { id, brand_id: 'b1', creator_id: `k-${id}`, brand: { id: 'b1', name: 'HYPERCORE', slug: 'hypercore' }, creator: { id: `k-${id}`, display_name: creator, handle: creator.toLowerCase() }, conversation_reads: [], last_message_seq: 0, last_message_at: null, created_at: '' },
    timeline: [],
  }) as unknown as Thread;
const withTesty = conversation('c1', 'Testy');
const withQwerty = conversation('c2', 'Qwerty');

/** The box as the messages page shows it: one per conversation and side. */
const boxFor = (thread: Thread, side: Side = 'brand') => <Composer key={draftPlace(thread.conversation.id, side)} thread={thread} side={side} />;

let show: (thread: Thread, side?: Side) => HTMLTextAreaElement;
function mount(thread: Thread = withTesty, side: Side = 'brand') {
  const view = render(boxFor(thread, side));
  show = (next, as = 'brand') => {
    rerender = () => view.rerender(boxFor(next, as));
    rerender();
    return screen.getByRole<HTMLTextAreaElement>('textbox');
  };
  return show(thread, side);
}

beforeEach(() => {
  sent.length = 0;
  sending.clear();
  forgetDrafts();
});
afterEach(cleanup);

describe('the message box', () => {
  it('empties as the message leaves, and keeps what is typed while it’s on its way', async () => {
    const box = mount();
    fireEvent.change(box, { target: { value: 'first message' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(sent.map((m) => m.body)).toEqual(['first message']);
    expect(box.value).toBe('');
    fireEvent.change(box, { target: { value: 'second, typed while the first is still sending' } });
    await sent[0].land();
    // emptying the box when the answer came back wiped the second message
    expect(box.value).toBe('second, typed while the first is still sending');
  });

  it('puts a message that didn’t arrive back in the box, ahead of anything typed since', async () => {
    const box = mount();
    fireEvent.change(box, { target: { value: 'are you there?' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await sent[0].fail();
    expect(box.value).toBe('are you there?');

    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.change(box, { target: { value: 'hello?' } });
    await sent[1].fail();
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

describe('what’s typed stays with its conversation', () => {
  it('isn’t in the next conversation’s box, and is still there on coming back', () => {
    let box = mount(withTesty);
    fireEvent.change(box, { target: { value: 'for Testy only: I can go to $2,000' } });
    // the page keeps the box on screen from one conversation to the next; the text used to stay in it,
    // one Enter from being sent to the wrong person
    box = show(withQwerty);
    expect(box.getAttribute('aria-label')).toBe('Message Qwerty');
    expect(box.value).toBe('');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(sent).toEqual([]);
    fireEvent.change(box, { target: { value: 'hi Qwerty' } });

    box = show(withTesty);
    expect(box.value).toBe('for Testy only: I can go to $2,000');
    box = show(withQwerty);
    expect(box.value).toBe('hi Qwerty');
  });

  it('keeps the two sides of one conversation apart (one person can sit on both)', () => {
    let box = mount(withTesty, 'brand');
    fireEvent.change(box, { target: { value: 'written as the brand' } });
    box = show(withTesty, 'creator');
    expect(box.value).toBe('');
    box = show(withTesty, 'brand');
    expect(box.value).toBe('written as the brand');
  });

  it('puts a message that fails after you’ve moved on back in its own conversation, not the one you’re in', async () => {
    let box = mount(withTesty);
    fireEvent.change(box, { target: { value: 'to Testy' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    box = show(withQwerty);
    fireEvent.change(box, { target: { value: 'to Qwerty, half written' } });
    await sent[0].fail();
    expect(sent[0]).toMatchObject({ to: 'c1', body: 'to Testy' });
    expect(screen.getByRole<HTMLTextAreaElement>('textbox').value).toBe('to Qwerty, half written');
    box = show(withTesty);
    expect(box.value).toBe('to Testy'); // waiting where it was written
  });

  it('lets a message be written to one person while another’s is still on its way', () => {
    let box = mount(withTesty);
    fireEvent.change(box, { target: { value: 'to Testy' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    box = show(withQwerty);
    fireEvent.change(box, { target: { value: 'to Qwerty' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(sent.map((m) => [m.to, m.body])).toEqual([['c1', 'to Testy'], ['c2', 'to Qwerty']]);
  });
});
