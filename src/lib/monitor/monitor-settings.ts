import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFirebaseClient, getFirebaseWorkspaceId } from "@/lib/firebase/client";
import type { ResolutionString } from "@/lib/types/charting";

export type MonitorSettings = {
  batchSize: number;
  refreshMinutes: number;
  resolution: ResolutionString;
};

const STORAGE_KEY = "mint-monitor-settings-v1";

export const defaultMonitorSettings: MonitorSettings = {
  batchSize: 8,
  refreshMinutes: 5,
  resolution: "5",
};

function normalizeSettings(settings: Partial<MonitorSettings> | null | undefined): MonitorSettings {
  return {
    batchSize: Math.min(30, Math.max(1, Number(settings?.batchSize) || defaultMonitorSettings.batchSize)),
    refreshMinutes: Math.min(240, Math.max(1, Number(settings?.refreshMinutes) || defaultMonitorSettings.refreshMinutes)),
    resolution: settings?.resolution || defaultMonitorSettings.resolution,
  };
}

function readLocalSettings() {
  if (typeof window === "undefined") return defaultMonitorSettings;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMonitorSettings;
    return normalizeSettings(JSON.parse(raw) as Partial<MonitorSettings>);
  } catch {
    return defaultMonitorSettings;
  }
}

function writeLocalSettings(settings: MonitorSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function getSettingsRef() {
  const firebase = getFirebaseClient();
  if (!firebase) return null;
  return doc(firebase.db, "workspaces", getFirebaseWorkspaceId(), "settings", "monitor");
}

export async function loadMonitorSettings() {
  const fallback = readLocalSettings();
  const settingsRef = getSettingsRef();
  if (!settingsRef) return fallback;

  try {
    const snapshot = await getDoc(settingsRef);
    if (!snapshot.exists()) return fallback;
    const settings = normalizeSettings(snapshot.data() as Partial<MonitorSettings>);
    writeLocalSettings(settings);
    return settings;
  } catch {
    return fallback;
  }
}

export async function saveMonitorSettings(settings: MonitorSettings) {
  const normalized = normalizeSettings(settings);
  writeLocalSettings(normalized);

  const settingsRef = getSettingsRef();
  if (!settingsRef) return normalized;

  await setDoc(
    settingsRef,
    {
      ...normalized,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return normalized;
}
