import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { env } from './env';

/**
 * The one Supabase client. Typed with the database's generated types, so every table, view and function call is
 * checked at build time. The session is kept in local storage and refreshed automatically.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // password-reset and confirmation links land with the session in the URL
    storageKey: 'gamein-auth',
  },
  realtime: { params: { eventsPerSecond: 10 } },
});

export type SupabaseClient = typeof supabase;
