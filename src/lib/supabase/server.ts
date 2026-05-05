import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;
let publicClient: SupabaseClient | null = null;

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getSupabasePublishableKey() {
  return process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
}

function createServerClient(key: string) {
  const url = getSupabaseUrl();
  if (!url) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getSupabaseAdmin() {
  if (adminClient) return adminClient;

  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    throw new Error("Supabase admin key is not configured. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  }

  adminClient = createServerClient(secretKey);
  return adminClient;
}

export function getSupabasePublicServerClient() {
  if (publicClient) return publicClient;

  const publishableKey = getSupabasePublishableKey();
  if (!publishableKey) {
    throw new Error("Supabase publishable key is not configured. Set SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }

  publicClient = createServerClient(publishableKey);
  return publicClient;
}
