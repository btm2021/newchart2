"use client";

import { clearAppLogs, formatLogTime, useAppLogs, type AppLogEntry } from "@/lib/logs/app-log-store";
import { ChevronDownIcon, ChevronUpIcon, TrashBinIcon } from "@/icons";
import { useEffect, useRef, useState } from "react";

const levelClass: Record<AppLogEntry["level"], string> = {
  info: "text-gray-600 dark:text-gray-300",
  success: "text-success-600 dark:text-success-400",
  warning: "text-warning-600 dark:text-warning-400",
  error: "text-error-600 dark:text-error-400",
};

export function AppLogPanel({ offsetClassName = "" }: { offsetClassName?: string }) {
  const logs = useAppLogs();
  const [isOpen, setIsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const latestLog = logs[0];

  useEffect(() => {
    if (!isOpen || !scrollRef.current) return;
    scrollRef.current.scrollTop = 0;
  }, [isOpen, logs.length]);

  return (
    <aside
      className={`fixed bottom-0 right-0 z-40 border-t border-gray-200 bg-white shadow-theme-lg transition-all duration-300 dark:border-gray-800 dark:bg-gray-950 ${offsetClassName}`}
      aria-label="Application event log"
    >
      <div className="flex h-10 items-center gap-3 border-b border-gray-100 px-3 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
          aria-label={isOpen ? "Collapse log panel" : "Expand log panel"}
          aria-expanded={isOpen}
        >
          {isOpen ? <ChevronDownIcon /> : <ChevronUpIcon />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Log</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-white/[0.08] dark:text-gray-300">
              {logs.length}
            </span>
          </div>
          {!isOpen ? (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {latestLog ? `[${latestLog.prefix}] ${latestLog.message}` : "[APP] Waiting for events"}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={clearAppLogs}
          disabled={logs.length === 0}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-error-500 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.06]"
          aria-label="Clear logs"
        >
          <TrashBinIcon />
        </button>
      </div>

      <div className={`overflow-hidden transition-[height] duration-300 ${isOpen ? "h-56" : "h-0"}`}>
        <div ref={scrollRef} className="h-56 overflow-auto px-3 py-2 font-mono text-xs custom-scrollbar">
          {logs.length > 0 ? (
            <div className="space-y-1">
              {logs.map((log) => (
                <div key={log.id} className={`grid grid-cols-[72px_96px_minmax(0,1fr)] gap-2 rounded-md px-2 py-1 ${levelClass[log.level]}`}>
                  <span className="text-gray-400">{formatLogTime(log.timestamp)}</span>
                  <span className="font-semibold">[{log.prefix}]</span>
                  <span className="min-w-0 break-words">{log.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">[APP] Waiting for events</div>
          )}
        </div>
      </div>
    </aside>
  );
}
