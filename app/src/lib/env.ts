// The Supabase project the app was built for (see .env.development, .env.production and .env.example). Both values
// are public: row-level security in the database protects the data, not the key.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('GameIn needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time (see app/.env.example)');
}

/** Where the app is served from, without the trailing slash ('' at the root, '/GameIn-version2/app' on Pages). */
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  basePath,
  /** An absolute link to a page of this app, for emails (password reset, sign-up confirmation). */
  pageUrl: (path: string) => window.location.origin + basePath + path,
} as const;
