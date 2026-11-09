import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button, Card, Notice, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { signIn } from './api';

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      navigate(from && from.startsWith('/') ? from : '/dashboard', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="g-public__narrow">
      <Card raised>
        <form className="g-stack" onSubmit={submit} noValidate>
          <div className="g-stack-sm">
            <h1>Sign in</h1>
            <p className="g-muted">Welcome back to GameIn.</p>
          </div>
          {error ? <Notice tone="coral">{error}</Notice> : null}
          <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" variant="primary" block loading={busy} disabled={!email || !password}>
            sign in
          </Button>
          <div className="g-between g-small">
            <Link to="/forgot-password">Forgot your password?</Link>
            <Link to="/sign-up">Create an account</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
