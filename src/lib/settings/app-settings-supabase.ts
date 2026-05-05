import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { defaultAppSettings, normalizeAppSettings, type AppSettings } from "@/lib/settings/app-settings";

type SettingsRow = {
  key: string;
  value: unknown;
  updated_at: string;
};

let supabase: SupabaseClient | null = null;

function getSupabase() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }

  supabase = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase;
}

export async function readAppSettings() {
  const { data, error } = await getSupabase()
    .from("app_settings")
    .select("key,value,updated_at")
    .eq("key", "global")
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!data) {
    await writeAppSettings(defaultAppSettings);
    return {
      settings: defaultAppSettings,
      updatedAt: null,
    };
  }

  const row = data as SettingsRow;
  return {
    settings: normalizeAppSettings(row.value),
    updatedAt: row.updated_at,
  };
}

export async function writeAppSettings(settings: AppSettings) {
  const normalized = normalizeAppSettings(settings);
  const { data, error } = await getSupabase()
    .from("app_settings")
    .upsert({ key: "global", value: normalized }, { onConflict: "key" })
    .select("key,value,updated_at")
    .single();

  if (error) throw new Error(error.message);

  const row = data as SettingsRow;
  return {
    settings: normalizeAppSettings(row.value),
    updatedAt: row.updated_at,
  };
}
