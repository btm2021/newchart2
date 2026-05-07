"use client";

import { logAppEvent } from "@/lib/logs/app-log-store";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

function stringifyConsoleValue(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function AppLogCapture() {
  const pathname = usePathname();
  const lastPathname = useRef<string | null>(null);

  useEffect(() => {
    if (lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    logAppEvent("ROUTE", `Navigated to ${pathname}`);
  }, [pathname]);

  useEffect(() => {
    const handleAppLog = (event: WindowEventMap["mint-app-log"]) => {
      logAppEvent(event.detail.prefix, event.detail.message, event.detail.level);
    };
    const handleError = (event: ErrorEvent) => {
      logAppEvent("ERROR", event.message || "Unhandled browser error.", "error");
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : stringifyConsoleValue(event.reason);
      logAppEvent("ERROR", `Unhandled promise rejection: ${reason}`, "error");
    };

    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args: unknown[]) => {
      logAppEvent("CONSOLE", args.map(stringifyConsoleValue).join(" "), "error");
      originalError(...args);
    };
    console.warn = (...args: unknown[]) => {
      logAppEvent("CONSOLE", args.map(stringifyConsoleValue).join(" "), "warning");
      originalWarn(...args);
    };

    window.addEventListener("mint-app-log", handleAppLog);
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    logAppEvent("APP", "Log capture ready.", "success");

    return () => {
      window.removeEventListener("mint-app-log", handleAppLog);
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return null;
}
