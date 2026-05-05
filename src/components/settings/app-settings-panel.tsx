"use client";

import { useEffect, useState } from "react";
import { defaultAppSettings, type AppSettings, type ExchangeEnvStatus } from "@/lib/settings/app-settings";

type SettingsResponse = {
  settings: AppSettings;
  updatedAt: string | null;
  exchangeEnv: ExchangeEnvStatus[];
  error?: string;
};

type ExchangeKeysPayload = {
  configured?: Record<string, Record<string, boolean>>;
  masked?: Record<string, Record<string, string>>;
  error?: string;
};

const EXCHANGE_KEY_FIELDS = {
  BINANCE: ["apiKey", "secret"],
  OKX: ["apiKey", "secret", "password"],
  BYBIT: ["apiKey", "secret"],
} as const;

export function AppSettingsPanel() {
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings);
  const [exchangeEnv, setExchangeEnv] = useState<ExchangeEnvStatus[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [exchangeKeys, setExchangeKeys] = useState<Record<string, Record<string, string>>>({});
  const [maskedExchangeKeys, setMaskedExchangeKeys] = useState<Record<string, Record<string, string>>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSettings() {
      setStatus("loading");
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        const payload = await response.json() as SettingsResponse;
        if (!response.ok) throw new Error(payload.error || "Could not load settings.");
        const keysResponse = await fetch("/api/account/exchange-api-keys", { cache: "no-store" });
        const keysPayload = await keysResponse.json() as ExchangeKeysPayload;
        if (keysResponse.ok) {
          setMaskedExchangeKeys(keysPayload.masked ?? {});
        }
        setSettings(payload.settings);
        setExchangeEnv(payload.exchangeEnv);
        setUpdatedAt(payload.updatedAt);
        setStatus("ready");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not load settings.");
        setStatus("error");
      }
    }

    void loadSettings();
  }, []);

  async function saveSettings() {
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      const payload = await response.json() as SettingsResponse;
      if (!response.ok) throw new Error(payload.error || "Could not save settings.");
      const keyResponse = await fetch("/api/account/exchange-api-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: exchangeKeys }),
      });
      const keyPayload = await keyResponse.json() as ExchangeKeysPayload;
      if (!keyResponse.ok) throw new Error(keyPayload.error || "Could not save exchange keys.");
      setSettings(payload.settings);
      setExchangeEnv(payload.exchangeEnv);
      setExchangeKeys({});
      setMaskedExchangeKeys(keyPayload.masked ?? {});
      setUpdatedAt(payload.updatedAt);
      setMessage("Settings saved to Supabase.");
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save settings.");
      setStatus("error");
    }
  }

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const updateExchangeKey = (exchange: string, key: string, value: string) => {
    setExchangeKeys((current) => ({
      ...current,
      [exchange]: {
        ...(current[exchange] ?? {}),
        [key]: value,
      },
    }));
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              Supabase settings
            </span>
            <h1 className="mt-3 text-xl font-semibold text-gray-900 dark:text-white">Application Settings</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Runtime behavior is stored in Supabase. Exchange API credentials stay in `.env`.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setSettings(defaultAppSettings)}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.04]"
            >
              Reset defaults
            </button>
            <button
              type="button"
              onClick={saveSettings}
              disabled={status === "saving" || status === "loading"}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "saving" ? "Saving..." : "Save settings"}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>Status: {status}</span>
          <span>Updated: {updatedAt ? new Date(updatedAt).toLocaleString() : "not synced"}</span>
          {message ? <span className={status === "error" ? "text-error-500" : "text-success-500"}>{message}</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-7">
          <SectionTitle title="Trading Defaults" subtitle="Default chart, dashboard and monitor behavior." />
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField label="Theme" value={settings.theme} onChange={(value) => updateSetting("theme", value as AppSettings["theme"])} options={["dark", "light", "system"]} />
            <SelectField label="Dashboard range" value={settings.defaultDashboardRange} onChange={(value) => updateSetting("defaultDashboardRange", value as AppSettings["defaultDashboardRange"])} options={["24h", "7d", "30d"]} />
            <SelectField label="Default source" value={settings.defaultChartSource} onChange={(value) => updateSetting("defaultChartSource", value as AppSettings["defaultChartSource"])} options={["BINANCE_FUTURES", "BINANCE_SPOT", "OKX_PERP"]} />
            <SelectField label="Default interval" value={settings.defaultInterval} onChange={(value) => updateSetting("defaultInterval", value as AppSettings["defaultInterval"])} options={["1", "5", "15", "30", "60", "240", "1D"]} />
            <TextField label="Default symbol" value={settings.defaultChartSymbol} onChange={(value) => updateSetting("defaultChartSymbol", value.toUpperCase())} />
            <NumberField label="Account refresh seconds" value={settings.accountRefreshSeconds} min={5} max={600} onChange={(value) => updateSetting("accountRefreshSeconds", value)} />
          </div>
        </section>

        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-5">
          <SectionTitle title="Exchange API Keys" subtitle="Stored per account in Supabase. Blank fields keep existing values." />
          <div className="mt-5 space-y-3">
            {exchangeEnv.map((exchange) => {
              const fields = EXCHANGE_KEY_FIELDS[exchange.id] ?? [];
              return (
                <ExchangeEnvCard
                  key={exchange.id}
                  exchange={exchange}
                  fields={[...fields]}
                  maskedKeys={maskedExchangeKeys[exchange.id] ?? {}}
                  draftKeys={exchangeKeys[exchange.id] ?? {}}
                  onChange={(key, value) => updateExchangeKey(exchange.id, key, value)}
                />
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-6">
          <SectionTitle title="Monitor Engine" subtitle="Controls smart request cadence and batch size." />
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField label="Batch size" value={settings.monitorBatchSize} min={1} max={200} onChange={(value) => updateSetting("monitorBatchSize", value)} />
            <NumberField label="Smart refresh seconds" value={settings.monitorRefreshSeconds} min={15} max={900} onChange={(value) => updateSetting("monitorRefreshSeconds", value)} />
            <NumberField label="Expire minutes" value={settings.monitorExpireMinutes} min={1} max={240} onChange={(value) => updateSetting("monitorExpireMinutes", value)} />
            <NumberField label="Smart divisor" value={settings.smartRefreshDivisor} min={1} max={200} onChange={(value) => updateSetting("smartRefreshDivisor", value)} />
          </div>
        </section>

        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-6">
          <SectionTitle title="Risk & Notifications" subtitle="Global guardrails for account monitoring." />
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField label="Max margin usage %" value={settings.riskMaxMarginUsage} min={1} max={100} onChange={(value) => updateSetting("riskMaxMarginUsage", value)} />
            <NumberField label="Max position leverage" value={settings.riskMaxPositionLeverage} min={1} max={125} onChange={(value) => updateSetting("riskMaxPositionLeverage", value)} />
          </div>
          <div className="mt-5 space-y-3">
            <ToggleField label="Paper mode" description="Keep account actions in simulation mode." checked={settings.paperMode} onChange={(value) => updateSetting("paperMode", value)} />
            <ToggleField label="Notifications" description="Enable application notifications." checked={settings.notificationsEnabled} onChange={(value) => updateSetting("notificationsEnabled", value)} />
            <ToggleField label="High risk alerts" description="Notify when risk thresholds are exceeded." checked={settings.notifyOnHighRisk} onChange={(value) => updateSetting("notifyOnHighRisk", value)} />
            <ToggleField label="API error alerts" description="Notify when an exchange API request fails." checked={settings.notifyOnApiError} onChange={(value) => updateSetting("notifyOnApiError", value)} />
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
      />
    </label>
  );
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-gray-100 p-3 dark:border-gray-800">
      <span>
        <span className="block text-sm font-medium text-gray-800 dark:text-white/90">{label}</span>
        <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
      />
    </label>
  );
}

function ExchangeEnvCard({
  exchange,
  fields,
  maskedKeys,
  draftKeys,
  onChange,
}: {
  exchange: ExchangeEnvStatus;
  fields: string[];
  maskedKeys: Record<string, string>;
  draftKeys: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{exchange.label}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Account-scoped credentials</p>
        </div>
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${exchange.configured ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400" : "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400"}`}>
          {exchange.configured ? "Ready" : "Missing"}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {fields.map((field) => (
          <label key={field} className="block">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {field} {maskedKeys[field] ? `(${maskedKeys[field]})` : ""}
            </span>
            <input
              value={draftKeys[field] ?? ""}
              onChange={(event) => onChange(field, event.target.value)}
              placeholder={maskedKeys[field] ? "Leave blank to keep current value" : field}
              type={field.toLowerCase().includes("secret") || field.toLowerCase().includes("password") ? "password" : "text"}
              className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-xs text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
