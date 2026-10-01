import { supabaseAnonKey, supabaseUrl } from './config.js';

export const isConfigured = !supabaseUrl.includes('SEU-PROJETO') && !supabaseAnonKey.includes('SUA-CHAVE');

export async function createSupabase() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { detectSessionInUrl: true, persistSession: true },
  });
}
