"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { openDB, type DBSchema } from "idb";
import { useEffect, useMemo, useState } from "react";

type TableInfo = {
  name: string;
  label: string;
  description: string;
  count: number;
};

type RequestState = "loading" | "ready" | "deleting" | "error";

type LocalRecord = {
  id: string;
  datasourceId: string;
  exchange: string;
  symbol: string;
  lastUpdated: number;
  bars: unknown[];
  cachedAt: number;
};

type LocalDatasourceSummary = {
  datasourceId: string;
  records: number;
  bars: number;
  lastUpdated: number;
  cachedAt: number;
};

interface LocalOhlcvDb extends DBSchema {
  records: {
    key: string;
    value: LocalRecord;
    indexes: {
      datasourceId: string;
      lastUpdated: number;
    };
  };
}

async function requestTables<T>(init?: RequestInit): Promise<T> {
  const response = await fetch("/api/admin/supabase-tables", {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Supabase table request failed.");
  }

  return response.json() as Promise<T>;
}

async function getLocalDb() {
  return openDB<LocalOhlcvDb>("nexa-monitor-ohlcv-cache", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("records")) {
        const store = db.createObjectStore("records", { keyPath: "id" });
        store.createIndex("datasourceId", "datasourceId");
        store.createIndex("lastUpdated", "lastUpdated");
      }
    },
  });
}

function formatUnix(timestamp: number) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp * 1000);
}

function formatCachedAt(timestamp: number) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("en", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function SupabaseDbControl() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [localRows, setLocalRows] = useState<LocalDatasourceSummary[]>([]);
  const [state, setState] = useState<RequestState>("loading");
  const [localState, setLocalState] = useState<RequestState>("loading");
  const [message, setMessage] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [activeTable, setActiveTable] = useState("");

  const totalRows = useMemo(
    () => tables.reduce((total, table) => total + table.count, 0),
    [tables],
  );
  const localTotals = useMemo(
    () => localRows.reduce(
      (totals, row) => ({
        records: totals.records + row.records,
        bars: totals.bars + row.bars,
      }),
      { records: 0, bars: 0 },
    ),
    [localRows],
  );

  async function loadTables() {
    setState("loading");
    setMessage("");
    try {
      const payload = await requestTables<{ tables: TableInfo[] }>();
      setTables(payload.tables);
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not load Supabase tables.");
    }
  }

  async function loadLocalDb() {
    setLocalState("loading");
    setLocalMessage("");

    try {
      const db = await getLocalDb();
      const records = await db.getAll("records");
      const summary = new Map<string, LocalDatasourceSummary>();

      records.forEach((record) => {
        const current = summary.get(record.datasourceId) ?? {
          datasourceId: record.datasourceId,
          records: 0,
          bars: 0,
          lastUpdated: 0,
          cachedAt: 0,
        };
        current.records += 1;
        current.bars += Array.isArray(record.bars) ? record.bars.length : 0;
        current.lastUpdated = Math.max(current.lastUpdated, record.lastUpdated || 0);
        current.cachedAt = Math.max(current.cachedAt, record.cachedAt || 0);
        summary.set(record.datasourceId, current);
      });

      setLocalRows([...summary.values()].sort((a, b) => a.datasourceId.localeCompare(b.datasourceId)));
      setLocalState("ready");
    } catch (error) {
      setLocalRows([]);
      setLocalState("error");
      setLocalMessage(error instanceof Error ? error.message : "Could not load client DB.");
    }
  }

  async function clearTable(table: string) {
    const confirmed = window.confirm(
      table === "all"
        ? "Delete all monitor data from Supabase?"
        : `Delete all data from ${table}?`,
    );
    if (!confirmed) return;

    setState("deleting");
    setActiveTable(table);
    setMessage("");

    try {
      await requestTables<{ ok: true }>({
        method: "DELETE",
        body: JSON.stringify({ table }),
      });
      await loadTables();
      setMessage(table === "all" ? "All monitor tables were cleared." : `${table} was cleared.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not clear table.");
    } finally {
      setActiveTable("");
    }
  }

  async function clearLocalDb() {
    const confirmed = window.confirm("Delete all local client OHLCV cache?");
    if (!confirmed) return;

    setLocalState("deleting");
    setLocalMessage("");

    try {
      const db = await getLocalDb();
      await db.clear("records");
      await loadLocalDb();
      setLocalMessage("Client OHLCV cache was cleared.");
    } catch (error) {
      setLocalState("error");
      setLocalMessage(error instanceof Error ? error.message : "Could not clear client DB.");
    }
  }

  useEffect(() => {
    void loadTables();
    void loadLocalDb();
  }, []);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Supabase DB Control</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {message || `${tables.length} monitor tables / ${totalRows.toLocaleString()} rows`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadTables()}
              disabled={state === "loading" || state === "deleting"}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void clearTable("all")}
              disabled={state === "loading" || state === "deleting" || totalRows === 0}
              className="inline-flex items-center rounded-lg bg-error-500 px-4 py-2.5 text-theme-sm font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear all
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {tables.map((table) => (
          <div
            key={table.name}
            className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white">{table.label}</h2>
                <p className="mt-1 truncate text-xs font-medium text-gray-400">{table.name}</p>
              </div>
              <span className="shrink-0 rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-white/[0.08] dark:text-gray-300">
                {table.count.toLocaleString()}
              </span>
            </div>
            <p className="mt-4 min-h-10 text-sm text-gray-500 dark:text-gray-400">{table.description}</p>
            <button
              type="button"
              onClick={() => void clearTable(table.name)}
              disabled={state === "loading" || state === "deleting" || table.count === 0}
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-error-200 px-4 py-2.5 text-theme-sm font-medium text-error-500 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-500/30 dark:hover:bg-error-500/10"
            >
              {activeTable === table.name ? "Clearing..." : "Clear table"}
            </button>
          </div>
        ))}
      </div>

      {state === "loading" ? (
        <div className="rounded-lg border border-gray-200 bg-white p-5 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
          Loading Supabase tables...
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Client DB</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {localMessage || `${localTotals.records.toLocaleString()} records / ${localTotals.bars.toLocaleString()} bars`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadLocalDb()}
              disabled={localState === "loading" || localState === "deleting"}
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              Refresh client
            </button>
            <button
              type="button"
              onClick={() => void clearLocalDb()}
              disabled={localState === "loading" || localState === "deleting" || localTotals.records === 0}
              className="inline-flex items-center rounded-lg bg-error-500 px-4 py-2.5 text-theme-sm font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear client DB
            </button>
          </div>
        </div>

        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-y border-gray-100 dark:border-gray-800">
              <TableRow>
                <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Datasource
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Records
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Bars
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Last update
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Cached
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
              {localRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="px-4 py-6 text-center text-theme-sm text-gray-500 dark:text-gray-400">
                    {localState === "loading" ? "Loading client DB..." : "No client cache found."}
                  </TableCell>
                </TableRow>
              ) : (
                localRows.map((row) => (
                  <TableRow key={row.datasourceId}>
                    <TableCell className="px-4 py-3 text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {row.datasourceId}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-end text-theme-sm text-gray-500 dark:text-gray-400">
                      {row.records.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-end text-theme-sm text-gray-500 dark:text-gray-400">
                      {row.bars.toLocaleString()}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                      {formatUnix(row.lastUpdated)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                      {formatCachedAt(row.cachedAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
