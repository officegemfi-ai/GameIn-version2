/* Which Supabase project the app uses.
 *
 * Empty (null): the page is the in-browser demo, as before.
 * Set to the project's URL and its anon (public) key, from the project's Settings > API page:
 *
 *   window.GAMEIN_SUPABASE = { url: 'https://<project-ref>.supabase.co', anonKey: '<anon key>', liveByDefault: false };
 *
 * With liveByDefault false, the live app opens at <page>?live and everyone else still gets the demo: the way to try it
 * before launch. With liveByDefault true, the live app is the page, and <page>?demo opens the demo.
 *
 * The anon key is meant to be public: row-level security and the database functions decide what anyone can do. */
window.GAMEIN_SUPABASE = window.GAMEIN_SUPABASE || {
  // the GameIn test project (Supabase organization GameIn, US West): the demo workspace on simulated payments
  url: 'https://fvqpwatjypsjniemhrxo.supabase.co',
  anonKey: 'sb_publishable_NL6Hs-HcmZKBJCPm398xaA_IyttEtaY',
  liveByDefault: false,
};
