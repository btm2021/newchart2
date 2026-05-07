"use client";

import { useSyncExternalStore } from "react";

export type AppLogLevel = "info" | "success" | "warning" | "error";

export type AppLogEntry = {
  id: number;
  prefix: string;
  message: string;
  level: AppLogLevel;
  timestamp: number;
};

type AppLogEventDetail = {
  prefix: string;
  message: string;
  level?: AppLogLevel;
};

const MAX_LOGS = 300;
const listeners = new Set<() => void>();
let entries: AppLogEntry[] = [];
let nextId = 1;

function emit() {
  listeners.forEach((listener) => listener());
}

function normalizePrefix(prefix: string) {
  return prefix.trim().replace(/^\[|\]$/g, "").toUpperCase() || "APP";
}

export function logAppEvent(prefix: string, message: string, level: AppLogLevel = "info") {
  const entry: AppLogEntry = {
    id: nextId,
    prefix: normalizePrefix(prefix),
    message: message.trim() || "Event",
    level,
    timestamp: Date.now(),
  };
  nextId += 1;
  entries = [entry, ...entries].slice(0, MAX_LOGS);
  emit();
}

export function clearAppLogs() {
  entries = [];
  emit();
}

export function subscribeAppLogs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAppLogsSnapshot() {
  return entries;
}

export function useAppLogs() {
  return useSyncExternalStore(subscribeAppLogs, getAppLogsSnapshot, getAppLogsSnapshot);
}

export function dispatchAppLogEvent(detail: AppLogEventDetail) {
  if (typeof window === "undefined") {
    logAppEvent(detail.prefix, detail.message, detail.level);
    return;
  }

  window.dispatchEvent(new CustomEvent("mint-app-log", { detail }));
}

export function formatLogTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp);
}

declare global {
  interface WindowEventMap {
    "mint-app-log": CustomEvent<AppLogEventDetail>;
  }
}
