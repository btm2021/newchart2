"use client";

import type {
  MonitorRecordsPatch,
  MonitorStatusesBySource,
  MonitorSymbolsBySource,
} from "@/lib/monitor/monitor-engine";
import { defaultMonitorSettings, type MonitorSettings } from "@/lib/monitor/monitor-settings";
import type { OhlcvMonitorRecord } from "@/lib/monitor/ohlcv-monitor-store";
import { useEffect, useState, useSyncExternalStore } from "react";

export type MonitorWorkerSnapshot = {
  started: boolean;
  settings: MonitorSettings;
  statuses: MonitorStatusesBySource;
  exchangeSymbols: MonitorSymbolsBySource;
  recordsById: Record<string, OhlcvMonitorRecord>;
  error: string | null;
};

type MonitorWorkerEvent =
  | { type: "settings"; settings: MonitorSettings }
  | { type: "statuses"; statuses: MonitorStatusesBySource }
  | { type: "symbols"; exchangeSymbols: MonitorSymbolsBySource }
  | { type: "records"; records: MonitorRecordsPatch }
  | {
      type: "snapshot";
      settings: MonitorSettings;
      statuses: MonitorStatusesBySource;
      exchangeSymbols: MonitorSymbolsBySource;
      records: MonitorRecordsPatch;
    }
  | { type: "error"; message: string };

const listeners = new Set<() => void>();

let worker: Worker | null = null;
let snapshot: MonitorWorkerSnapshot = {
  started: false,
  settings: defaultMonitorSettings,
  statuses: {},
  exchangeSymbols: {},
  recordsById: {},
  error: null,
};

function emit() {
  listeners.forEach((listener) => listener());
}

function updateSnapshot(patch: Partial<MonitorWorkerSnapshot>) {
  snapshot = {
    ...snapshot,
    ...patch,
  };
  emit();
}

function handleWorkerEvent(event: MessageEvent<MonitorWorkerEvent>) {
  const payload = event.data;

  switch (payload.type) {
    case "settings":
      updateSnapshot({ settings: payload.settings, error: null });
      return;
    case "statuses":
      updateSnapshot({ statuses: payload.statuses, error: null });
      return;
    case "symbols":
      updateSnapshot({ exchangeSymbols: payload.exchangeSymbols, error: null });
      return;
    case "records":
      if (listeners.size === 0) return;
      updateSnapshot({
        recordsById: {
          ...snapshot.recordsById,
          ...payload.records,
        },
        error: null,
      });
      return;
    case "snapshot":
      updateSnapshot({
        settings: payload.settings,
        statuses: payload.statuses,
        exchangeSymbols: payload.exchangeSymbols,
        recordsById: payload.records,
        error: null,
      });
      return;
    case "error":
      updateSnapshot({ error: payload.message });
      return;
  }
}

export function startMonitorWorker() {
  if (typeof window === "undefined") return;

  if (!worker) {
    worker = new Worker(new URL("../../workers/monitor-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", handleWorkerEvent);
    worker.addEventListener("error", (event) => {
      updateSnapshot({ error: event.message || "Monitor worker failed." });
    });
  }

  if (!snapshot.started) {
    updateSnapshot({ started: true });
    worker.postMessage({ type: "start" });
  }

  if (listeners.size > 0) {
    worker.postMessage({ type: "sync" });
  }
}

export function stopMonitorWorker() {
  if (!worker) return;
  worker.postMessage({ type: "stop" });
  updateSnapshot({ started: false });
}

export function subscribeMonitorWorker(listener: () => void) {
  listeners.add(listener);
  if (worker) {
    worker.postMessage({ type: "sync" });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      updateSnapshot({ recordsById: {} });
    }
  };
}

export function getMonitorWorkerSnapshot() {
  return snapshot;
}

export function useMonitorWorkerSnapshot() {
  const externalSnapshot = useSyncExternalStore(
    subscribeMonitorWorker,
    getMonitorWorkerSnapshot,
    getMonitorWorkerSnapshot,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    startMonitorWorker();
  }, []);

  return mounted ? externalSnapshot : snapshot;
}
