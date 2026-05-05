import { defaultAppSettings, normalizeAppSettings, type AppSettings } from "@/lib/settings/app-settings";
import { readAccount, readAccountAppSettings, writeAccountAppSettings } from "@/lib/accounts/accounts-supabase";

export async function readAppSettings(accountId?: string) {
  if (!accountId) {
    return {
      settings: defaultAppSettings,
      updatedAt: null,
    };
  }

  const account = await readAccount(accountId);
  if (!account) {
    return {
      settings: defaultAppSettings,
      updatedAt: null,
    };
  }

  return {
    settings: await readAccountAppSettings(accountId),
    updatedAt: null,
  };
}

export async function writeAppSettings(settings: AppSettings, accountId?: string) {
  const normalized = normalizeAppSettings(settings);
  if (!accountId) {
    return {
      settings: normalized,
      updatedAt: null,
    };
  }

  return {
    settings: await writeAccountAppSettings(accountId, normalized),
    updatedAt: new Date().toISOString(),
  };
}
