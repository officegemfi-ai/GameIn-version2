import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button, Card, Notice, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import { sendPasswordReset } from './api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="g-public__narrow">
      <Card raised>
        {sent ? (
          <div className="g-stack">
            <h1>Check your inbox</h1>
            <p className="g-muted">If there’s an account for {email.trim()}, we’ve sent it a link to set a new password.</p>
            <Link to="/sign-in">Back to sign in</Link>
          </div>
        ) : (
          <form className="g-stack" onSubmit={submit} noValidate>
            <div className="g-stack-sm">
              <h1>Reset your password</h1>
              <p className="g-muted">We’ll email you a link to set a new one.</p>
            </div>
            {error ? <Notice tone="coral">{error}</Notice> : null}
            <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button type="submit" variant="primary" block loading={busy} disabled={!email}>
              send the link
            </Button>
            <Link className="g-small" to="/sign-in">Back to sign in</Link>
          </form>
        )}
      </Card>
    </div>
  );
}
