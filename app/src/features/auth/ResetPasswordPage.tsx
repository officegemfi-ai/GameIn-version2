import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Card, Loading, Notice, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { PASSWORD_MIN, setNewPassword } from './api';
import { useAuth } from './AuthProvider';

/** Where a password-reset email leads: the link signs the person in, and here they choose a new password. */
export default function ResetPasswordPage() {
  const { user, loading, endRecovery } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Loading />;
  if (!user) {
    return (
      <div className="g-public__narrow">
        <Card raised>
          <div className="g-stack">
            <h1>This link has expired</h1>
            <p className="g-muted">Password links work once, for a short while. Ask for a new one.</p>
            <Link to="/forgot-password">Send a new link</Link>
          </div>
        </Card>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < PASSWORD_MIN) return setError(`Use at least ${PASSWORD_MIN} characters`);
    if (password !== again) return setError('The two passwords don’t match');
    setError(null);
    setBusy(true);
    try {
      await setNewPassword(password);
      endRecovery();
      navigate('/dashboard', { replace: true });
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
            <h1>Choose a new password</h1>
            <p className="g-muted">For {user.email}.</p>
          </div>
          {error ? <Notice tone="coral">{error}</Notice> : null}
          <TextField label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint={`At least ${PASSWORD_MIN} characters.`} />
          <TextField label="The same again" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          <Button type="submit" variant="primary" block loading={busy}>
            save the new password
          </Button>
        </form>
      </Card>
    </div>
  );
}
