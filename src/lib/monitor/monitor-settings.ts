import { defaultAppSettings, type AppSettings } from "@/lib/settings/app-settings";
import type { ResolutionString } from "@/lib/types/charting";

export type MonitorSettings = {
  batchSize: number;
  refreshMinutes: number;
  resolution: ResolutionString;
};

type SettingsResponse = {
  settings?: AppSettings;
};

export const defaultMonitorSettings: MonitorSettings = {
  batchSize: defaultAppSettings.monitorBatchSize,
  refreshMinutes: defaultAppSettings.monitorRefreshSeconds / 60,
  resolution: defaultAppSettings.defaultInterval,
};

function normalizeSettings(settings: Partial<MonitorSettings> | null | undefined): MonitorSettings {
  return {
    batchSize: Math.min(200, Math.max(1, Number(settings?.batchSize) || defaultMonitorSettings.batchSize)),
    refreshMinutes: Math.min(240, Math.max(1, Number(settings?.refreshMinutes) || defaultMonitorSettings.refreshMinutes)),
    resolution: settings?.resolution || defaultMonitorSettings.resolution,
  };
}

function fromAppSettings(settings: AppSettings): MonitorSettings {
  return normalizeSettings({
    batchSize: settings.monitorBatchSize,
    refreshMinutes: Math.max(1, Math.round(settings.monitorRefreshSeconds / 60)),
    resolution: settings.defaultInterval,
  });
}

function toAppSettings(current: AppSettings, monitorSettings: MonitorSettings): AppSettings {
  return {
    ...current,
    monitorBatchSize: monitorSettings.batchSize,
    monitorRefreshSeconds: monitorSettings.refreshMinutes * 60,
    defaultInterval: monitorSettings.resolution as AppSettings["defaultInterval"],
  };
}

async function readAppSettings() {
  const response = await fetch("/api/settings", { cache: "no-store" });
  const payload = await response.json() as SettingsResponse & { error?: string };
  if (!response.ok || !payload.settings) {
    throw new Error(payload.error || "Could not load settings.");
  }
  return payload.settings;
}

export async function loadMonitorSettings() {
  try {
    return fromAppSettings(await readAppSettings());
  } catch {
    return defaultMonitorSettings;
  }
}

export async function saveMonitorSettings(settings: MonitorSettings) {
  const normalized = normalizeSettings(settings);
  const current = await readAppSettings();
  const response = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: toAppSettings(current, normalized) }),
  });
  const payload = await response.json() as SettingsResponse & { error?: string };
  if (!response.ok || !payload.settings) {
    throw new Error(payload.error || "Could not save settings.");
  }
  return fromAppSettings(payload.settings);
}
