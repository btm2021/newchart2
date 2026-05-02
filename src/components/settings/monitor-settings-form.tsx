"use client";

import {
  defaultMonitorSettings,
  loadMonitorSettings,
  saveMonitorSettings,
  type MonitorSettings,
} from "@/lib/monitor/monitor-settings";
import type { ResolutionString } from "@/lib/types/charting";
import { useEffect, useState } from "react";

const RESOLUTION_OPTIONS: Array<{ label: string; value: ResolutionString }> = [
  { label: "1m", value: "1" },
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "1h", value: "60" },
  { label: "4h", value: "240" },
  { label: "1D", value: "1D" },
];

export function MonitorSettingsForm() {
  const [settings, setSettings] = useState<MonitorSettings>(defaultMonitorSettings);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let disposed = false;

    void loadMonitorSettings().then((loadedSettings) => {
      if (disposed) return;
      setSettings(loadedSettings);
      setState("ready");
    });

    return () => {
      disposed = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");

    try {
      const saved = await saveMonitorSettings(settings);
      setSettings(saved);
      setState("saved");
      setMessage("Saved monitor settings.");
    } catch {
      setState("error");
      setMessage("Could not save settings to Firebase.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6"
    >
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Monitor Settings</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Saved to Firebase and used by the OHLCV monitor workers.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Batch size</span>
          <input
            type="number"
            min={1}
            max={30}
            value={settings.batchSize}
            disabled={state === "loading" || state === "saving"}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                batchSize: Math.min(30, Math.max(1, Number(event.target.value) || 1)),
              }))
            }
            className="mt-2 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:text-white"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Resolution</span>
          <select
            value={settings.resolution}
            disabled={state === "loading" || state === "saving"}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                resolution: event.target.value as ResolutionString,
              }))
            }
            className="mt-2 h-11 w-full rounded-lg border border-gray-200 bg-transparent px-3 text-sm text-gray-800 dark:border-gray-700 dark:text-white"
          >
            {RESOLUTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={state === "loading" || state === "saving"}
          className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "saving" ? "Saving..." : "Save settings"}
        </button>
        {message ? (
          <span className={`text-sm ${state === "error" ? "text-error-500" : "text-success-500"}`}>
            {message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
