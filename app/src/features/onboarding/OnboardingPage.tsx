import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Card, Notice, TextField, useToast } from '@/components/ui';
import { must } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/features/auth/AuthProvider';
import { useSeats } from '@/features/seats/SeatProvider';

/** "Instant Shock" → "instantshock": a handle to start from. */
export function suggestHandle(name: string): string {
  return name.normalize('NFKD').replace(/[^A-Za-z0-9_.-]+/g, '').toLowerCase().slice(0, 32);
}

function CreatorForm({ defaultName, onDone }: { defaultName: string; onDone: (id: string) => void }) {
  const [displayName, setDisplayName] = useState(defaultName);
  const [handle, setHandle] = useState(suggestHandle(defaultName));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onDone(await must(supabase.rpc('create_creator_profile', { p_handle: handle.trim(), p_display_name: displayName.trim() })));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <form className="g-stack" onSubmit={submit} noValidate>
      {error ? <Notice tone="coral">{error}</Notice> : null}
      <TextField label="Creator name" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} hint="How brands see you." />
      <TextField label="Handle" prefix="@" value={handle} maxLength={32} onChange={(e) => setHandle(e.target.value)} hint="Your page will be gamein/c/handle: 2 to 32 letters, digits, dots, dashes or underscores." />
      <Button type="submit" variant="primary" loading={busy} disabled={!displayName.trim() || handle.trim().length < 2}>
        create my creator profile
      </Button>
    </form>
  );
}

function BrandForm({ onDone }: { onDone: (id: string) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onDone(await must(supabase.rpc('create_brand', { p_name: name.trim() })));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <form className="g-stack" onSubmit={submit} noValidate>
      {error ? <Notice tone="coral">{error}</Notice> : null}
      <TextField label="Brand name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} hint="You’ll own it, and can add teammates later." />
      <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
        create the brand
      </Button>
    </form>
  );
}

/** A new account sets up its first seat here; anyone can add a creator profile or another brand later. */
export default function OnboardingPage() {
  const user = useUser();
  const { seats, creatorSeat, refresh, setSeat } = useSeats();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const wantsBrand = params.get('role') === 'brand';
  const name = String(user.user_metadata?.name ?? '').trim();

  const done = async (side: 'creator' | 'brand', id: string) => {
    await refresh();
    setSeat({ side, id });
    toast.info(side === 'creator' ? 'Your creator profile is ready. Add a package so brands can book you.' : 'Your brand is ready. Find a creator to work with.');
    navigate(side === 'creator' ? '/packages' : '/discover', { replace: true });
  };

  const creatorCard = !creatorSeat ? (
    <Card title="I’m a creator" raised>
      <p className="g-muted" style={{ marginBottom: 16 }}>List packages, answer offers, deliver, and get paid from escrow.</p>
      <CreatorForm defaultName={name} onDone={(id) => void done('creator', id)} />
    </Card>
  ) : null;
  const brandCard = (
    <Card title={seats.some((s) => s.side === 'brand') ? 'Add another brand' : 'I’m a brand'} raised>
      <p className="g-muted" style={{ marginBottom: 16 }}>Book creators, fund escrow, approve their work.</p>
      <BrandForm onDone={(id) => void done('brand', id)} />
    </Card>
  );

  return (
    <div className="g-page g-page--narrow g-public__wide">
      <div className="g-stack-sm">
        <h1>{seats.length ? 'Add a seat' : `Welcome${name ? `, ${name}` : ''}`}</h1>
        <p className="g-muted">
          {seats.length
            ? 'One account can be a creator and work for any number of brands. Switch between them from the top bar.'
            : 'How will you use GameIn? You can add the other side later.'}
        </p>
      </div>
      <div className="g-grid-2">
        {wantsBrand ? brandCard : creatorCard}
        {wantsBrand ? creatorCard : brandCard}
      </div>
      {seats.length ? <Link to="/dashboard">Back to the dashboard</Link> : null}
    </div>
  );
}
