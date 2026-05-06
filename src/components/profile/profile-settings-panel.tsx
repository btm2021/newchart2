"use client";

import { readBrowserSession, saveBrowserSession } from "@/lib/auth/browser-auth";
import { useEffect, useState } from "react";

type ExchangeId = "BINANCE" | "OKX" | "BYBIT";

type AccountProfile = {
  accountId: string;
  username: string;
  displayName: string;
  email: string;
  phone: string;
  address: string;
  exchangeEnabled: Record<ExchangeId, boolean>;
};

type ProfileResponse = {
  profile?: AccountProfile;
  error?: string;
};

type ExchangeKeysPayload = {
  masked?: Record<string, Record<string, string>>;
  error?: string;
};

const EXCHANGES: Array<{
  id: ExchangeId;
  label: string;
  fields: string[];
}> = [
  { id: "BINANCE", label: "Binance", fields: ["apiKey", "secret"] },
  { id: "OKX", label: "OKX", fields: ["apiKey", "secret", "password"] },
  { id: "BYBIT", label: "Bybit", fields: ["apiKey", "secret"] },
];

const emptyProfile: AccountProfile = {
  accountId: "",
  username: "",
  displayName: "",
  email: "",
  phone: "",
  address: "",
  exchangeEnabled: {
    BINANCE: true,
    OKX: false,
    BYBIT: false,
  },
};

export function ProfileSettingsPanel() {
  const [profile, setProfile] = useState<AccountProfile>(emptyProfile);
  const [password, setPassword] = useState("");
  const [draftKeys, setDraftKeys] = useState<Record<string, Record<string, string>>>({});
  const [maskedKeys, setMaskedKeys] = useState<Record<string, Record<string, string>>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      setStatus("loading");
      setMessage("");
      try {
        const [profileResponse, keysResponse] = await Promise.all([
          fetch("/api/account/profile", { cache: "no-store" }),
          fetch("/api/account/exchange-api-keys", { cache: "no-store" }),
        ]);

        const profilePayload = await profileResponse.json() as ProfileResponse;
        if (!profileResponse.ok || !profilePayload.profile) {
          throw new Error(profilePayload.error || "Could not load profile.");
        }

        const keysPayload = await keysResponse.json().catch(() => ({})) as ExchangeKeysPayload;
        if (keysResponse.ok) {
          setMaskedKeys(keysPayload.masked ?? {});
        }

        setProfile(profilePayload.profile);
        setStatus("ready");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not load profile.");
        setStatus("error");
      }
    }

    void loadProfile();
  }, []);

  function updateProfile<K extends keyof AccountProfile>(key: K, value: AccountProfile[K]) {
    setProfile((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateExchangeEnabled(exchange: ExchangeId, enabled: boolean) {
    setProfile((current) => ({
      ...current,
      exchangeEnabled: {
        ...current.exchangeEnabled,
        [exchange]: enabled,
      },
    }));
  }

  function updateExchangeKey(exchange: ExchangeId, key: string, value: string) {
    setDraftKeys((current) => ({
      ...current,
      [exchange]: {
        ...(current[exchange] ?? {}),
        [key]: value,
      },
    }));
  }

  async function saveProfile() {
    setStatus("saving");
    setMessage("");
    try {
      const profileResponse = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: {
            displayName: profile.displayName,
            email: profile.email,
            phone: profile.phone,
            address: profile.address,
            exchangeEnabled: profile.exchangeEnabled,
            password,
          },
        }),
      });
      const profilePayload = await profileResponse.json() as ProfileResponse;
      if (!profileResponse.ok || !profilePayload.profile) {
        throw new Error(profilePayload.error || "Could not save profile.");
      }

      const keyResponse = await fetch("/api/account/exchange-api-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: draftKeys }),
      });
      const keyPayload = await keyResponse.json() as ExchangeKeysPayload;
      if (!keyResponse.ok) {
        throw new Error(keyPayload.error || "Could not save exchange API keys.");
      }

      setProfile(profilePayload.profile);
      setPassword("");
      setDraftKeys({});
      setMaskedKeys(keyPayload.masked ?? {});

      const session = readBrowserSession();
      if (session) {
        saveBrowserSession({
          ...session,
          displayName: profilePayload.profile.displayName,
          email: profilePayload.profile.email,
        });
      }

      setMessage("Profile saved.");
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save profile.");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Profile</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              User profile, login password and exchange account access are stored per user in Supabase.
            </p>
          </div>
          <button
            type="button"
            onClick={saveProfile}
            disabled={status === "loading" || status === "saving"}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "saving" ? "Saving..." : "Save profile"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>Status: {status}</span>
          {message ? <span className={status === "error" ? "text-error-500" : "text-success-500"}>{message}</span> : null}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-7">
          <SectionTitle title="User Information" subtitle={`User ID: ${profile.accountId || "loading"}`} />
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label="Username" value={profile.username} disabled onChange={() => undefined} />
            <TextField label="Name" value={profile.displayName} onChange={(value) => updateProfile("displayName", value)} />
            <TextField label="Email" value={profile.email} type="email" onChange={(value) => updateProfile("email", value)} />
            <TextField label="Phone" value={profile.phone} onChange={(value) => updateProfile("phone", value)} />
            <div className="md:col-span-2">
              <TextField label="Address" value={profile.address} onChange={(value) => updateProfile("address", value)} />
            </div>
            <div className="md:col-span-2">
              <TextField
                label="New password"
                value={password}
                type="password"
                placeholder="Leave blank to keep current password"
                onChange={setPassword}
              />
            </div>
          </div>
        </section>

        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-5">
          <SectionTitle title="Exchange Access" subtitle="Enable exchanges and store account-read API credentials per user." />
          <div className="mt-5 space-y-3">
            {EXCHANGES.map((exchange) => (
              <ExchangeCard
                key={exchange.id}
                exchange={exchange}
                enabled={Boolean(profile.exchangeEnabled[exchange.id])}
                maskedKeys={maskedKeys[exchange.id] ?? {}}
                draftKeys={draftKeys[exchange.id] ?? {}}
                onToggle={(enabled) => updateExchangeEnabled(exchange.id, enabled)}
                onKeyChange={(key, value) => updateExchangeKey(exchange.id, key, value)}
              />
            ))}
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

function TextField({
  label,
  value,
  type = "text",
  placeholder,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <input
        value={value}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90 dark:disabled:bg-white/[0.02]"
      />
    </label>
  );
}

function ExchangeCard({
  exchange,
  enabled,
  maskedKeys,
  draftKeys,
  onToggle,
  onKeyChange,
}: {
  exchange: { id: ExchangeId; label: string; fields: string[] };
  enabled: boolean;
  maskedKeys: Record<string, string>;
  draftKeys: Record<string, string>;
  onToggle: (enabled: boolean) => void;
  onKeyChange: (key: string, value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block font-medium text-gray-900 dark:text-white">{exchange.label}</span>
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
            {enabled ? "Enabled for this user" : "Disabled for this user"}
          </span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
          className="h-5 w-5 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
        />
      </label>
      <div className="mt-3 space-y-2">
        {exchange.fields.map((field) => (
          <label key={field} className="block">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {field} {maskedKeys[field] ? `(${maskedKeys[field]})` : ""}
            </span>
            <input
              value={draftKeys[field] ?? ""}
              onChange={(event) => onKeyChange(field, event.target.value)}
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
