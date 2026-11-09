import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ItemsEditor } from '@/components/ui/ItemsEditor';
import { initials } from '@/components/ui/HexAvatar';
import { proofFileName, proofPath } from '@/lib/storage';
import type { Item } from '@/lib/types';
import { offerState } from './offers/api';
import { cleanSearch } from './creators/api';
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

  it('says whose turn an offer is', () => {
    expect(offerState({ status: 'sent', waiting_on: 'creator' }, 'creator')).toMatchObject({ yourTurn: true, open: true, label: 'your turn' });
    expect(offerState({ status: 'sent', waiting_on: 'creator' }, 'brand')).toMatchObject({ yourTurn: false, open: true, label: 'waiting on the creator' });
    expect(offerState({ status: 'expired', waiting_on: null }, 'brand')).toMatchObject({ open: false, label: 'expired' });
    expect(offerState({ status: 'accepted', waiting_on: null }, 'creator')).toMatchObject({ tone: 'mint', open: false });
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
