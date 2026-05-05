import { getSupabaseAdmin } from "@/lib/supabase/server";
import { normalizeAppSettings, type AppSettings } from "@/lib/settings/app-settings";
import type { UserWorkspaceState } from "@/lib/storage/workspace-state";

export type AccountSession = {
  accountId: string;
  username: string;
  displayName: string;
};

export type ExchangeApiKeys = Record<string, Record<string, string>>;

type VerifyAccountRow = {
  id: string;
  username: string;
  display_name: string;
  chart_settings: unknown;
};

type AccountRow = {
  id: string;
  username: string;
  display_name: string;
  chart_settings: unknown;
  exchange_api_keys: unknown;
};

export async function verifyAccountPassword(username: string, password: string): Promise<AccountSession | null> {
  const { data, error } = await getSupabaseAdmin()
    .rpc("verify_account_password", {
      p_username: username,
      p_password: password,
    });

  if (error) throw new Error(error.message);

  const row = (Array.isArray(data) ? data[0] : null) as VerifyAccountRow | null;
  if (!row) return null;

  return {
    accountId: row.id,
    username: row.username,
    displayName: row.display_name,
  };
}

export async function readAccount(accountId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("accounts")
    .select("id,username,display_name,chart_settings,exchange_api_keys")
    .eq("id", accountId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AccountRow | null;
}

export async function readAccountChartSettings(accountId: string): Promise<Partial<UserWorkspaceState>> {
  const account = await readAccount(accountId);
  return typeof account?.chart_settings === "object" && account.chart_settings !== null
    ? account.chart_settings as Partial<UserWorkspaceState>
    : {};
}

export async function writeAccountChartSettings(accountId: string, settings: Record<string, unknown>) {
  const { data, error } = await getSupabaseAdmin()
    .from("accounts")
    .update({
      chart_settings: settings,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId)
    .select("chart_settings")
    .single();

  if (error) throw new Error(error.message);
  return data?.chart_settings as Record<string, unknown>;
}

export async function readAccountAppSettings(accountId: string): Promise<AppSettings> {
  const settings = await readAccountChartSettings(accountId);
  return normalizeAppSettings(settings);
}

export async function writeAccountAppSettings(accountId: string, settings: AppSettings) {
  return normalizeAppSettings(await writeAccountChartSettings(accountId, settings));
}

export async function readExchangeApiKeys(accountId: string): Promise<ExchangeApiKeys> {
  const account = await readAccount(accountId);
  return typeof account?.exchange_api_keys === "object" && account.exchange_api_keys !== null
    ? account.exchange_api_keys as ExchangeApiKeys
    : {};
}

export async function writeExchangeApiKeys(accountId: string, patch: ExchangeApiKeys) {
  const current = await readExchangeApiKeys(accountId);
  const next: ExchangeApiKeys = { ...current };

  Object.entries(patch).forEach(([exchange, keys]) => {
    next[exchange] = {
      ...(next[exchange] ?? {}),
      ...Object.fromEntries(
        Object.entries(keys).filter(([, value]) => value.trim().length > 0),
      ),
    };
  });

  const { data, error } = await getSupabaseAdmin()
    .from("accounts")
    .update({
      exchange_api_keys: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId)
    .select("exchange_api_keys")
    .single();

  if (error) throw new Error(error.message);
  return data?.exchange_api_keys as ExchangeApiKeys;
}

export function maskExchangeApiKeys(keys: ExchangeApiKeys) {
  return Object.fromEntries(
    Object.entries(keys).map(([exchange, values]) => [
      exchange,
      Object.fromEntries(
        Object.entries(values).map(([name, value]) => [
          name,
          value ? `${value.slice(0, 4)}...${value.slice(-4)}` : "",
        ]),
      ),
    ]),
  );
}
