"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteOhlcvMonitorData,
  readAllSymbolUpdates,
  type OhlcvSymbolUpdate,
} from "@/lib/monitor/ohlcv-monitor-store";
import { useEffect, useMemo, useState } from "react";

function formatLastUpdated(timestamp: number) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp * 1000);
}

export function MonitorDataTable() {
  const [rows, setRows] = useState<OhlcvSymbolUpdate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [state, setState] = useState<"loading" | "ready" | "deleting" | "error">("loading");
  const [message, setMessage] = useState("");

  const selectedCount = selectedIds.size;
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  const groupedCount = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      counts.set(row.datasourceId, (counts.get(row.datasourceId) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([datasourceId, count]) => `${datasourceId}: ${count}`)
      .join(" / ");
  }, [rows]);

  async function loadRows() {
    setState("loading");
    setMessage("");
    try {
      const updates = await readAllSymbolUpdates();
      setRows(updates);
      setSelectedIds((current) => new Set([...current].filter((id) => updates.some((row) => row.id === id))));
      setState("ready");
    } catch (error) {
      setRows([]);
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not load monitor data.");
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  async function handleDelete(ids: string[]) {
    if (ids.length === 0) return;
    setState("deleting");
    setMessage("");
    try {
      await deleteOhlcvMonitorData(ids);
      setSelectedIds(new Set());
      await loadRows();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Could not delete monitor data.");
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white px-4 pb-4 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Monitor Data</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {message || `${rows.length.toLocaleString()} cached symbols${groupedCount ? ` / ${groupedCount}` : ""}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadRows()}
            disabled={state === "loading" || state === "deleting"}
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleDelete([...selectedIds])}
            disabled={selectedCount === 0 || state === "deleting"}
            className="inline-flex items-center rounded-lg bg-error-500 px-4 py-2.5 text-theme-sm font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Delete selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </button>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto">
        <div className="min-w-[760px]">
          <Table>
            <TableHeader className="border-y border-gray-100 dark:border-gray-800">
              <TableRow>
                <TableCell isHeader className="w-12 px-4 py-3 text-start">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    disabled={rows.length === 0}
                    onChange={(event) => {
                      setSelectedIds(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set());
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
                    aria-label="Select all monitor data"
                  />
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Symbol
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Source
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Resolution
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Last update
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Action
                </TableCell>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-4 py-6 text-center text-theme-sm text-gray-500 dark:text-gray-400">
                    {state === "loading" ? "Loading cached data..." : "No monitor data found."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={(event) => {
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (event.target.checked) {
                              next.add(row.id);
                            } else {
                              next.delete(row.id);
                            }
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
                        aria-label={`Select ${row.symbol}`}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-3 text-theme-sm font-medium text-gray-800 dark:text-white/90">
                      {row.symbol}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                      {row.datasourceId}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                      {row.resolution}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                      {formatLastUpdated(row.lastUpdated)}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-end">
                      <button
                        type="button"
                        onClick={() => void handleDelete([row.id])}
                        disabled={state === "deleting"}
                        className="rounded-lg border border-error-200 px-3 py-1.5 text-theme-xs font-medium text-error-500 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-error-500/30 dark:hover:bg-error-500/10"
                      >
                        Delete
                      </button>
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
