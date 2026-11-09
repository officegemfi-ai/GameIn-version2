// What each kind of to-do (the database's todos view) means: which navigation badge it counts toward, and how the
// dashboard shows it. One table, so the badges and the dashboard can never disagree about a kind.
import type { ReactNode } from 'react';
import { TimeLeft, type Tone } from '@/components/ui';
import type { TodoRow } from '@/lib/types';

/** A line on the dashboard's "Needs you" list. */
export interface Task {
  key: string;
  chip: string;
  tone: Tone;
  text: ReactNode;
  to: string;
  amount?: number | null;
}

/** The navigation badge a to-do counts toward. */
type TodoGroup = 'offers' | 'proofs' | 'messages' | 'renewals';

interface TodoKind {
  group: TodoGroup;
  /** Starts the task's key, so two kinds about the same thing (an offer) never collide. */
  keyPrefix: string;
  chip: string;
  tone: Tone;
  to: (t: TodoRow) => string;
  text: (t: TodoRow) => ReactNode;
  /** Shows the to-do's amount. */
  amount: boolean;
}

const answer = (t: TodoRow) => (
  <>
    Answer <b className="g-strong">{t.title}</b>
    {t.due_at ? <span className="g-muted"> · <TimeLeft until={t.due_at} /></span> : null}
  </>
);
const offerLink = (t: TodoRow) => `/offers/${t.ref_id}`;

const KINDS: Record<string, TodoKind> = {
  answer_offer: { group: 'offers', keyPrefix: 'o', chip: 'offer', tone: 'mint', to: offerLink, text: answer, amount: true },
  answer_counter: { group: 'offers', keyPrefix: 'o', chip: 'counter', tone: 'mint', to: offerLink, text: answer, amount: true },
  answer_pitch: { group: 'offers', keyPrefix: 'o', chip: 'pitch', tone: 'mint', to: offerLink, text: answer, amount: true },
  review_proof: {
    group: 'proofs',
    keyPrefix: 'p',
    chip: 'proof',
    tone: 'amber',
    to: (t) => `/proofs/${t.ref_id}`,
    text: (t) => (
      <>
        Review proof for <b className="g-strong">{t.title}</b>
      </>
    ),
    amount: true,
  },
  unread_messages: { group: 'messages', keyPrefix: 'm', chip: 'message', tone: 'neutral', to: (t) => `/messages/${t.ref_id}`, text: () => 'Unread messages', amount: false },
  answer_renewal: {
    group: 'renewals',
    keyPrefix: 'r',
    chip: 'renew',
    tone: 'neutral',
    to: () => '/deals',
    text: (t) => (
      <>
        Renewal for <b className="g-strong">{t.title}</b>
      </>
    ),
    amount: true,
  },
};

/** A to-do as a dashboard task; null for a kind this app doesn't know yet. */
export function todoTask(t: TodoRow): Task | null {
  const kind = KINDS[t.kind ?? ''];
  if (!kind) return null;
  return { key: kind.keyPrefix + t.ref_id, chip: kind.chip, tone: kind.tone, to: kind.to(t), text: kind.text(t), ...(kind.amount ? { amount: t.amount_cents } : {}) };
}

/** Every known to-do as a task, in the database's order. */
export const todoTasks = (rows: TodoRow[] | undefined): Task[] => (rows ?? []).flatMap((t) => todoTask(t) ?? []);

export type TodoCounts = Record<TodoGroup, number>;

/** How many to-dos each navigation badge shows. */
export function countTodos(rows: TodoRow[] | undefined): TodoCounts {
  const c: TodoCounts = { offers: 0, proofs: 0, messages: 0, renewals: 0 };
  for (const r of rows ?? []) {
    const kind = KINDS[r.kind ?? ''];
    if (kind) c[kind.group]++;
  }
  return c;
}
