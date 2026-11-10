// Every error the app shows goes through here. The database already words its refusals for people ("This offer is
// waiting on the creator to reply", with the rule id in `hint`), so those are shown as they are; auth and network
// errors get the same plain voice.

const AUTH: Record<string, string> = {
  invalid_credentials: 'That email and password don’t match.',
  email_not_confirmed: 'Confirm your email first: open the link we sent you.',
  user_already_exists: 'There’s already an account with that email. Sign in instead.',
  email_exists: 'There’s already an account with that email. Sign in instead.',
  weak_password: 'Pick a stronger password: at least 8 characters.',
  same_password: 'That’s your current password. Pick a new one.',
  over_email_send_rate_limit: 'Too many emails just now. Wait a minute and try again.',
  over_request_rate_limit: 'Too many tries just now. Wait a minute and try again.',
  signup_disabled: 'New accounts are closed for now.',
  email_address_invalid: 'That email address doesn’t look right.',
  validation_failed: 'Check the email and password.',
  session_expired: 'Your session expired. Sign in again.',
  refresh_token_not_found: 'Your session expired. Sign in again.',
};

interface ErrorLike {
  message?: string;
  code?: string;
  hint?: string | null;
  status?: number;
  name?: string;
}

/** The rule id a database refusal carries (O9, E6 ...), if any. */
export function ruleOf(error: unknown): string | null {
  const e = error as ErrorLike | null;
  return e && typeof e.hint === 'string' && /^[A-Z]\d{1,2}$/.test(e.hint) ? e.hint : null;
}

export function errorMessage(error: unknown): string {
  if (!error) return 'Something went wrong. Try again.';
  if (typeof error === 'string') return error;
  const e = error as ErrorLike;
  const message = typeof e.message === 'string' ? e.message : '';

  // the browser couldn't reach the server at all (each browser words it differently)
  if ((e.name === 'TypeError' && /fetch|network|load failed/i.test(message)) || /Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return 'Can’t reach GameIn. Check your connection and try again.';
  }
  if (e.code && AUTH[e.code]) return AUTH[e.code];
  if (e.name === 'AuthApiError' || e.name === 'AuthWeakPasswordError') {
    if (/invalid login credentials/i.test(message)) return AUTH.invalid_credentials;
    if (/already registered/i.test(message)) return AUTH.user_already_exists;
    if (/password/i.test(message) && /least|weak|short/i.test(message)) return AUTH.weak_password;
  }
  // PostgREST: an expired token, a broken unique rule, a row-level security refusal on a direct write
  if (e.code === 'PGRST301' || e.code === 'PGRST303') return AUTH.session_expired;
  // an id that isn't one (a link that was cut short or mistyped): the database can't even look it up
  if (e.code === '22P02') return 'That link doesn’t lead anywhere: part of it is missing or mistyped.';
  if (e.code === '23505') return 'That’s already taken. Try another.';
  if (e.code === '23514') return 'Check the details: one of them isn’t allowed.';
  if (e.code === '42501' && /row-level security/i.test(message)) return 'You can’t change that from this seat.';
  // the database's own refusals, and anything else with a readable message
  if (message && message.length < 300 && !/^\{|^</.test(message)) return message;
  return 'Something went wrong. Try again.';
}
