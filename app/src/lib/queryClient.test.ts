import { describe, expect, it } from 'vitest';
import { must, maybe, one } from './db';
import { retryable } from './queryClient';

describe('asking again after a failed read', () => {
  it('leaves what the Supabase client already retried to it: no answer at all, or "busy"', () => {
    // twelve requests and a 24-second spinner came from retrying these on top of the client's own three tries
    expect(retryable(0, { message: 'TypeError: Failed to fetch', code: '', status: 0 })).toBe(false);
    expect(retryable(0, { message: 'Service Unavailable', status: 503 })).toBe(false);
    expect(retryable(0, { message: 'unknown error', status: 520 })).toBe(false);
  });

  it('doesn’t ask again for something the server refused or couldn’t understand', () => {
    expect(retryable(0, { status: 404, message: 'That deal wasn’t found.' })).toBe(false);
    expect(retryable(0, { status: 401, code: 'PGRST301', message: 'JWT expired' })).toBe(false);
    expect(retryable(0, { code: '22P02', message: 'invalid input syntax for type uuid: "abc"' })).toBe(false);
    expect(retryable(0, { code: 'P0001', hint: 'O9', message: 'This offer is waiting on the creator' })).toBe(false);
    expect(retryable(0, { code: 'P0002', message: 'Deal not found' })).toBe(false);
    expect(retryable(0, { code: '42501', message: 'permission denied for table deals' })).toBe(false);
  });

  it('gives a server error the client doesn’t retry two more tries', () => {
    const gateway = { status: 502, message: 'Bad Gateway' };
    expect(retryable(0, gateway)).toBe(true);
    expect(retryable(1, gateway)).toBe(true);
    expect(retryable(2, gateway)).toBe(false);
    expect(retryable(0, new Error('something else'))).toBe(true);
  });
});

describe('errors thrown from a response', () => {
  const answer = <T>(data: T, error: unknown, status: number) => Promise.resolve({ data, error, status });

  it('carry the answer’s HTTP status, which is how a retry is decided', async () => {
    await expect(must(answer(null, { message: 'TypeError: Failed to fetch', code: '' }, 0))).rejects.toMatchObject({ status: 0 });
    await expect(maybe(answer(null, { message: 'Bad Gateway' }, 502))).rejects.toMatchObject({ status: 502 });
    await expect(one(answer(null, { code: '22P02', message: 'invalid input syntax for type uuid' }, 400))).rejects.toMatchObject({ status: 400, code: '22P02' });
    // what couldn't reach the server isn't asked for again here; the test above says why
    expect(retryable(0, await must(answer(null, { message: 'TypeError: Failed to fetch', code: '' }, 0)).catch((e: unknown) => e))).toBe(false);
  });

  it('return the data when there is no error, and say so when a row that has to exist doesn’t', async () => {
    await expect(must(answer([1, 2], null, 200))).resolves.toEqual([1, 2]);
    await expect(maybe(answer(null, null, 200))).resolves.toBeNull();
    await expect(one(answer(null, null, 200), 'That deal')).rejects.toMatchObject({ status: 404, message: expect.stringContaining('That deal wasn’t found') });
  });
});
