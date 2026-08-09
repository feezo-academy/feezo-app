import { createClient } from '@supabase/supabase-js';

// ── SUPABASE CONFIG (anon key is public — RLS protects the data) ──
const SUPABASE_URL = 'https://nhyjzvcvvfvksburdous.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7mzkG0jTz2ynLvS6N-D_1w_ZNHPdLKR';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'sac_supabase_auth',
  },
});

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data ? data.user : null;
}
