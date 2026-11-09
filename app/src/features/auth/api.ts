import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/**
 * A new account. With email confirmation on, there's no session until the person opens the link (and Supabase
 * answers an existing email the same way, so nobody can find out who has an account).
 */
export async function signUp(input: { email: string; password: string; name: string }): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: { name: input.name.trim() }, emailRedirectTo: env.pageUrl('/onboarding') },
  });
  if (error) throw error;
  if (!data.session && data.user && data.user.identities && data.user.identities.length === 0) {
    throw Object.assign(new Error('There’s already an account with that email. Sign in instead.'), { code: 'user_already_exists' });
  }
  return { needsConfirmation: !data.session };
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: env.pageUrl('/reset-password') });
  if (error) throw error;
}

export async function setNewPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Signs out of this browser (other devices stay signed in). */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}

export const PASSWORD_MIN = 8;
