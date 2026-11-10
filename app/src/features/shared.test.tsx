import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ItemsEditor } from '@/components/ui/ItemsEditor';
import { initials } from '@/components/ui/HexAvatar';
import { proofFileName, proofPath } from '@/lib/storage';
import type { Item } from '@/lib/types';
import { offerState, tabState, waitsOn } from './offers/model';
import { cleanSearch, creatorProfileRow } from './creators/api';
import { newestLineKey } from './messages/api';
import { onboardingPath } from './auth/api';
import { suggestHandle } from './onboarding/OnboardingPage';
import { shortLink } from './deals/Proof';

describe('small helpers', () => {
  it('names proof files so the database can tell their deal, and shows them back plainly', () => {
    const path = proofPath('6e374b77-68c8-424b-a360-79004b95651b', 'stream screenshot (1).png', 1_700_000_000_000);
    expect(path).toBe('6e374b77-68c8-424b-a360-79004b95651b/loyw3v28-stream-screenshot-1-.png');
    expect(proofFileName(path)).toBe('stream-screenshot-1-.png');
    expect(proofPath('d', '../../etc/passwd', 1)).toBe('d/1-..-..-etc-passwd');
  });

  it('keeps searches to characters that are safe in a filter', () => {
    expect(cleanSearch('  Insta,shock()*  ')).toBe('Instashock');
    expect(cleanSearch('ready_player.one')).toBe('ready_player.one');
  });

  it('makes initials and handles', () => {
    expect(initials('Instant Shock')).toBe('IS');
    expect(initials('hypercore')).toBe('HY');
    expect(initials('')).toBe('?');
    expect(suggestHandle('Instant Shock!')).toBe('instantshock');
  });

  it('shortens proof links for display', () => {
    expect(shortLink('https://www.twitch.tv/videos/2299110')).toBe('twitch.tv/videos/2299110');
    expect(shortLink('not a url')).toBe('not a url');
  });

  it('saves a creator profile the way the database keeps it', () => {
    expect(
      creatorProfileRow({
        displayName: ' Nova ',
        handle: ' nova ',
        bio: ' FPS streams ',
        platforms: [{ platform: 'twitch', followers: ' 350K ' }, { platform: '', followers: '1' }, { platform: 'kick', followers: '  ' }],
      }),
    ).toEqual({ display_name: 'Nova', handle: 'nova', bio: 'FPS streams', platforms: [{ platform: 'twitch', followers: '350K' }, { platform: 'kick' }] });
  });

  it('follows a thread by its newest line, which still changes once the thread is full', () => {
    const line = (n: number) => ({ kind: 'message', ref: `m${n}` });
    const full = Array.from({ length: 200 }, (_, i) => line(i + 1)); // a thread shows its last 200 lines
    const next = [...full.slice(1), line(201)]; // a new message pushes the oldest out: still 200
    expect(next.length).toBe(full.length);
    expect(newestLineKey(next)).not.toBe(newestLineKey(full));
    expect(newestLineKey(full)).toBe('message:m200');
    expect(newestLineKey([])).toBe('');
    // a message and an event can carry the same number
    expect(newestLineKey([{ kind: 'offer_sent', ref: '7' }])).not.toBe(newestLineKey([{ kind: 'message', ref: '7' }]));
  });

  it('sends a new account on to set up the side it signed up as', () => {
    expect(onboardingPath('brand')).toBe('/onboarding?role=brand');
    expect(onboardingPath('creator')).toBe('/onboarding?role=creator');
  });

  it('says whose turn an offer is', () => {
    expect(offerState({ status: 'sent', waiting_on: 'creator' }, 'creator')).toMatchObject({ yourTurn: true, open: true, label: 'your turn' });
    expect(offerState({ status: 'sent', waiting_on: 'creator' }, 'brand')).toMatchObject({ yourTurn: false, open: true, label: 'waiting on the creator' });
    expect(offerState({ status: 'expired', waiting_on: null }, 'brand')).toMatchObject({ open: false, label: 'expired' });
    expect(offerState({ status: 'accepted', waiting_on: null }, 'creator')).toMatchObject({ tone: 'mint', open: false });
  });

  it('asks each open tab for the stored state that waits on the right side, as the database says whose turn it is', () => {
    // private.waiting_on: a sent offer waits on the creator, a countered one (or a pitch) on the brand
    expect(waitsOn).toEqual({ creator: 'sent', brand: 'countered' });
    expect(tabState('yours', 'brand')).toBe('countered');
    expect(tabState('theirs', 'brand')).toBe('sent');
    expect(tabState('yours', 'creator')).toBe('sent');
    expect(tabState('theirs', 'creator')).toBe('countered');
    // and the row agrees with the tab it was asked for under
    for (const side of ['brand', 'creator'] as const) {
      const mine = { status: tabState('yours', side), waiting_on: side };
      const theirs = { status: tabState('theirs', side), waiting_on: side === 'brand' ? ('creator' as const) : ('brand' as const) };
      expect(offerState(mine, side)).toMatchObject({ yourTurn: true, open: true });
      expect(offerState(theirs, side)).toMatchObject({ yourTurn: false, open: true });
    }
  });
});

describe('the deliverables editor', () => {
  function Harness() {
    const [items, setItems] = useState<Item[]>([{ label: '' }]);
    return (
      <>
        <ItemsEditor items={items} onChange={setItems} />
        <output data-testid="out">{JSON.stringify(items)}</output>
      </>
    );
  }

  it('adds, edits and removes deliverables, never fewer than one', () => {
    render(<Harness />);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Remove deliverable 1' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Deliverable 1'), { target: { value: 'Launch stream' } });
    fireEvent.change(screen.getByLabelText('Days for deliverable 1'), { target: { value: '5 days' } });
    fireEvent.click(screen.getByRole('button', { name: /add a deliverable/ }));
    fireEvent.change(screen.getByLabelText('Deliverable 2'), { target: { value: 'Recap clip' } });
    expect(JSON.parse(screen.getByTestId('out').textContent!)).toEqual([{ label: 'Launch stream', days: 5 }, { label: 'Recap clip' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove deliverable 1' }));
    expect(JSON.parse(screen.getByTestId('out').textContent!)).toEqual([{ label: 'Recap clip' }]);
  });
});
