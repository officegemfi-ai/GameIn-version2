import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Card, HexAvatar, Icon, Notice, SelectField, TextAreaField, TextField } from '@/components/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAction } from '@/app/useAction';
import { errorMessage } from '@/lib/errors';
import type { Platform } from '@/lib/types';
import { PASSWORD_MIN, setNewPassword, useSignOut } from '@/features/auth/api';
import { useUser } from '@/features/auth/AuthProvider';
import { useSeat, useSeats } from '@/features/seats/SeatProvider';
import { platformsOf, useCreatorById, useSaveCreatorProfile } from '@/features/creators/api';
import { useBrand, useSaveBrandName } from '@/features/brands/api';
import { useProfile, useSaveProfileName } from './api';

const PLATFORMS = ['twitch', 'youtube', 'tiktok', 'instagram', 'kick', 'x', 'discord'];

function AccountCard() {
  const user = useUser();
  const profile = useProfile(user.id);
  const [name, setName] = useState('');
  useEffect(() => setName(profile.data?.display_name ?? ''), [profile.data?.display_name]);
  const save = useSaveProfileName(user.id);
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const changePw = useAction(setNewPassword, { success: 'Password changed.', onSuccess: () => setPw(''), quiet: true });
  const signOut = useSignOut();

  const submitPw = (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < PASSWORD_MIN) return setPwError(`Use at least ${PASSWORD_MIN} characters`);
    setPwError(null);
    changePw.mutate(pw, { onError: (err) => setPwError(errorMessage(err)) });
  };

  return (
    <Card title="Your account">
      <div className="g-stack">
        <form className="g-row g-settings__row" onSubmit={(e) => { e.preventDefault(); save.mutate(name); }}>
          <TextField label="Your name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} hint="Your teammates and the people you deal with see it." />
          <Button type="submit" loading={save.isPending} disabled={!name.trim() || name === profile.data?.display_name}>save</Button>
        </form>
        <div className="g-field">
          <span className="g-field__label">Email</span>
          <span>{user.email}</span>
        </div>
        <form className="g-row g-settings__row" onSubmit={submitPw}>
          <TextField label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} error={pwError} />
          <Button type="submit" loading={changePw.isPending} disabled={!pw}>change</Button>
        </form>
        <div>
          <Button variant="danger" icon="logout" onClick={signOut}>sign out</Button>
        </div>
      </div>
    </Card>
  );
}

function CreatorCard({ creatorId }: { creatorId: string }) {
  const q = useCreatorById(creatorId);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const { refresh } = useSeats();
  useEffect(() => {
    if (!q.data) return;
    setDisplayName(q.data.display_name);
    setHandle(q.data.handle);
    setBio(q.data.bio);
    setPlatforms(platformsOf(q.data.platforms));
  }, [q.data]);
  const save = useSaveCreatorProfile(creatorId, () => void refresh());
  if (!q.data) return null;
  return (
    <Card title="Creator profile" actions={<Link className="g-small" to={`/c/${q.data.handle}`}>view public page</Link>}>
      <form className="g-stack" onSubmit={(e) => { e.preventDefault(); save.mutate({ displayName, handle, bio, platforms }); }}>
        <div className="g-grid-2">
          <TextField label="Creator name" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} />
          <TextField label="Handle" prefix="@" value={handle} maxLength={32} onChange={(e) => setHandle(e.target.value)} hint="Changing it changes your page’s address." />
        </div>
        <TextAreaField label="Bio" value={bio} maxLength={600} onChange={(e) => setBio(e.target.value)} placeholder="What you play, when you stream, who watches" />
        <fieldset className="g-items">
          <legend className="g-field__label">Platforms</legend>
          {platforms.map((p, i) => (
            <div key={i} className="g-row g-platformrow">
              <SelectField label={`Platform ${i + 1}`} value={p.platform} onChange={(e) => setPlatforms(platforms.map((x, n) => (n === i ? { ...x, platform: e.target.value } : x)))}>
                {[...new Set([...PLATFORMS, p.platform])].map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </SelectField>
              <TextField label="Followers" value={p.followers ?? ''} maxLength={12} placeholder="e.g. 350K" onChange={(e) => setPlatforms(platforms.map((x, n) => (n === i ? { ...x, followers: e.target.value } : x)))} />
              <button type="button" className="g-btn g-btn--ghost g-btn--icon g-btn--sm" aria-label={`Remove platform ${i + 1}`} onClick={() => setPlatforms(platforms.filter((_, n) => n !== i))}>
                <Icon name="x" />
              </button>
            </div>
          ))}
          {platforms.length < 8 ? (
            <button type="button" className="g-btn g-btn--ghost g-btn--sm g-items__add" onClick={() => setPlatforms([...platforms, { platform: PLATFORMS.find((n) => !platforms.some((p) => p.platform === n)) ?? 'twitch', followers: '' }])}>
              <Icon name="plus" /> add a platform
            </button>
          ) : null}
        </fieldset>
        {save.error ? <Notice tone="coral">{errorMessage(save.error)}</Notice> : null}
        <div>
          <Button type="submit" variant="primary" loading={save.isPending}>save profile</Button>
        </div>
      </form>
    </Card>
  );
}

function BrandCard({ brandId, canEdit }: { brandId: string; canEdit: boolean }) {
  const q = useBrand(brandId);
  const { refresh } = useSeats();
  const [name, setName] = useState('');
  useEffect(() => setName(q.data?.name ?? ''), [q.data?.name]);
  const save = useSaveBrandName(brandId, () => void refresh());
  if (!q.data) return null;
  return (
    <Card title="Brand">
      <form className="g-row g-settings__row" onSubmit={(e) => { e.preventDefault(); save.mutate(name); }}>
        <TextField label="Brand name" value={name} maxLength={80} disabled={!canEdit} onChange={(e) => setName(e.target.value)} hint={canEdit ? `Web name: ${q.data.slug}` : 'Only the brand’s owners and admins can change it.'} />
        {canEdit ? <Button type="submit" loading={save.isPending} disabled={!name.trim() || name === q.data.name}>save</Button> : null}
      </form>
    </Card>
  );
}

export default function SettingsPage() {
  const seat = useSeat();
  const { seats, creatorSeat } = useSeats();
  return (
    <div className="g-page g-page--narrow">
      <PageHeader title="Settings" />
      <AccountCard />
      {creatorSeat ? <CreatorCard creatorId={creatorSeat.id} /> : null}
      {seat.side === 'brand' ? <BrandCard brandId={seat.id} canEdit={seat.role === 'owner' || seat.role === 'admin'} /> : null}
      <Card title="Your seats" actions={<Link className="g-small" to="/onboarding">add a seat</Link>}>
        <div className="g-list">
          {seats.map((s) => (
            <div key={`${s.side}:${s.id}`} className="g-item">
              <HexAvatar name={s.name} size={34} brand={s.side === 'brand'} />
              <span className="g-item__main">
                <span className="g-item__title">{s.name}</span>
                <span className="g-item__sub">{s.side === 'brand' ? `brand · ${s.role}` : 'creator profile'}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
