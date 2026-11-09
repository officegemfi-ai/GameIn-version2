import { describe, expect, it } from 'vitest';
import { errorMessage, ruleOf } from './errors';

describe('error messages', () => {
  it('shows the database’s own refusal, and knows its rule', () => {
    const refusal = { message: 'This offer is waiting on the creator to reply to your last version', code: 'P0001', hint: 'O9' };
    expect(errorMessage(refusal)).toBe(refusal.message);
    expect(ruleOf(refusal)).toBe('O9');
    expect(ruleOf({ message: 'x', hint: 'not a rule' })).toBeNull();
  });

  it('words auth errors plainly', () => {
    expect(errorMessage({ name: 'AuthApiError', code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('That email and password don’t match.');
    expect(errorMessage({ name: 'AuthApiError', message: 'Invalid login credentials' })).toBe('That email and password don’t match.');
    expect(errorMessage({ code: 'user_already_exists', message: 'User already registered' })).toMatch(/already an account/);
    expect(errorMessage({ code: 'over_email_send_rate_limit', message: 'x' })).toMatch(/Too many emails/);
  });

  it('turns network failures and database codes into something readable', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toMatch(/Can’t reach GameIn/);
    expect(errorMessage({ code: 'PGRST301', message: 'JWT expired' })).toMatch(/session expired/);
    expect(errorMessage({ code: '23505', message: 'duplicate key value violates unique constraint' })).toMatch(/already taken/);
    expect(errorMessage({ code: '42501', message: 'new row violates row-level security policy for table "packages"' })).toMatch(/can’t change that/);
  });

  it('never shows raw markup or nothing at all', () => {
    expect(errorMessage('<html>502</html>')).toBe('<html>502</html>'); // a plain string is the caller's own words
    expect(errorMessage({ message: '<html><body>Bad gateway</body></html>' })).toBe('Something went wrong. Try again.');
    expect(errorMessage(null)).toBe('Something went wrong. Try again.');
    expect(errorMessage({})).toBe('Something went wrong. Try again.');
  });
});
