import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Card, Notice, Segmented, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import type { Side } from '@/lib/types';
import { PASSWORD_MIN, signUp } from './api';

export default function SignUpPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState<Side>(params.get('role') === 'brand' ? 'brand' : 'creator');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const problem =
    !name.trim() ? 'Enter your name' :
    !/^\S+@\S+\.\S+$/.test(email.trim()) ? 'Enter your email' :
    password.length < PASSWORD_MIN ? `Use at least ${PASSWORD_MIN} characters for the password` :
    !terms ? 'Agree to the terms to continue' : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      const { needsConfirmation } = await signUp({ email, password, name });
      if (needsConfirmation) {
        setSentTo(email.trim());
        setBusy(false);
      } else {
        navigate(`/onboarding?role=${role}`, { replace: true });
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="g-public__narrow">
        <Card raised>
          <div className="g-stack">
            <h1>Check your inbox</h1>
            <p className="g-muted">
              We sent a link to <b className="g-strong">{sentTo}</b>. Open it to confirm your email, and you’ll come back here to set up your
              {role === 'brand' ? ' brand' : ' creator profile'}.
            </p>
            <Link to="/sign-in">Back to sign in</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="g-public__narrow">
      <Card raised>
        <form className="g-stack" onSubmit={submit} noValidate>
          <div className="g-stack-sm">
            <h1>Create your account</h1>
            <p className="g-muted">{role === 'brand' ? 'Book gaming creators, with your money held in escrow until the work is done.' : 'Get sponsored, and get paid the moment a brand approves your work.'}</p>
          </div>
          <div className="g-stack-sm">
            <span className="g-field__label" id="role-label">I’m joining as</span>
            <Segmented label="I’m joining as" value={role} onChange={setRole} options={[{ value: 'creator', label: 'creator' }, { value: 'brand', label: 'brand' }]} />
          </div>
          {error ? <Notice tone="coral">{error}</Notice> : null}
          <TextField label="Your name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN}
            hint={`At least ${PASSWORD_MIN} characters.`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="g-check">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>I agree to GameIn’s terms and privacy policy. In test mode no real money moves.</span>
          </label>
          <Button type="submit" variant="primary" block loading={busy}>
            create account
          </Button>
          <p className="g-small g-muted">
            Already have an account? <Link to="/sign-in">Sign in</Link>
          </p>
        </form>
      </Card>
    </div>
  );
}
