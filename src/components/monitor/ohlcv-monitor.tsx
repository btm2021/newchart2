"use client";

import { MiniLineChart } from "@/components/monitor/mini-line-chart";
import { getDatasourceRegistry } from "@/lib/datasources/registry";
import type { DatasourceAdapter, SymbolDescriptor } from "@/lib/datasources/types";
import {
  defaultMonitorSettings,
  loadMonitorSettings,
  type MonitorSettings,
} from "@/lib/monitor/monitor-settings";
import {
  readRecordsByDatasource,
  writeOhlcvRecords,
  type OhlcvMonitorRecord,
} from "@/lib/monitor/ohlcv-monitor-store";
import type { Bar, ResolutionString } from "@/lib/types/charting";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ExchangeStatus = {
  datasourceId: string;
  label: string;
  totalSymbols: number;
  dueSymbols: number;
  updated: number;
  failed: number;
  activeBatch: number;
  state: "idle" | "initializing" | "running" | "waiting" | "stopped" | "error";
  lastMessage: string;
};

const BATCH_DELAY_MS = 3_000;
const LOOKBACK_BARS = 1500;
const EXPIRE_SCAN_INTERVAL_SECONDS = 15 * 60;
const OUTDATED_AFTER_SECONDS = 15 * 60;
const SMART_REFRESH_INTERVAL_SECONDS = 60;
const SMART_REFRESH_DIVISOR = 30;
const FAVORITES_SOURCE_ID = "FAVORITES";
const FAVORITES_STORAGE_KEY = "mint-monitor-favorites-v1";
const VIRTUAL_CARD_GAP = 16;
const MONITOR_CARD_HEIGHT = 220;

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function sleep(ms: number, shouldStop: () => boolean) {
  return new Promise<void>((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (shouldStop() || Date.now() - startedAt >= ms) {
        resolve();
        return;
      }
      window.setTimeout(tick, 150);
    };
    tick();
  });
}

function resolutionToSeconds(resolution: ResolutionString) {
  switch (resolution) {
    case "1":
      return 60;
    case "5":
      return 300;
    case "15":
      return 900;
    case "30":
      return 1_800;
    case "60":
      return 3_600;
    case "240":
      return 14_400;
    case "1D":
      return 86_400;
    case "1W":
      return 604_800;
    case "1M":
      return 2_592_000;
    default:
      return 300;
  }
}

function getChangePercent(bars: Bar[]) {
  const first = bars.at(-2)?.close;
  const last = bars.at(-1)?.close;
  if (!first || !last) return 0;
  return ((last - first) / first) * 100;
}

function toStatus(adapter: DatasourceAdapter): ExchangeStatus {
  return {
    datasourceId: adapter.id,
    label: adapter.label,
    totalSymbols: 0,
    dueSymbols: 0,
    updated: 0,
    failed: 0,
    activeBatch: 0,
    state: "idle",
    lastMessage: "Waiting",
  };
}

async function settleWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results: PromiseSettledResult<R>[] = [];

  for (let index = 0; index < items.length; index += concurrency) {
    const chunk = items.slice(index, index + concurrency);
    results.push(...await Promise.allSettled(chunk.map(worker)));
  }

  return results;
}

function getSmartRefreshSymbols(symbols: SymbolDescriptor[], cursor: number) {
  if (symbols.length === 0) {
    return { symbols: [] as SymbolDescriptor[], nextCursor: 0 };
  }

  const windowSize = Math.max(1, Math.ceil(symbols.length / SMART_REFRESH_DIVISOR));
  const selected: SymbolDescriptor[] = [];

  for (let offset = 0; offset < windowSize; offset += 1) {
    selected.push(symbols[(cursor + offset) % symbols.length]);
  }

  return {
    symbols: selected,
    nextCursor: (cursor + windowSize) % symbols.length,
  };
}

export function OhlcvMonitor() {
  const isRunning = true;
  const [settings, setSettings] = useState<MonitorSettings>(defaultMonitorSettings);
  const [statuses, setStatuses] = useState<Record<string, ExchangeStatus>>({});
  const [exchangeSymbols, setExchangeSymbols] = useState<Record<string, SymbolDescriptor[]>>({});
  const [recordsById, setRecordsById] = useState<Record<string, OhlcvMonitorRecord>>({});
  const [query, setQuery] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(FAVORITES_SOURCE_ID);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const stopRef = useRef(false);
  const runTokenRef = useRef(0);
  const rollingCursorRef = useRef(new Map<string, number>());
  const lastExpireScanRef = useRef(new Map<string, number>());

  const updateStatus = useCallback((datasourceId: string, patch: Partial<ExchangeStatus>) => {
    setStatuses((current) => ({
      ...current,
      [datasourceId]: {
        ...current[datasourceId],
        ...patch,
      },
    }));
  }, []);

  const loadSettings = useCallback(async () => {
    const loadedSettings = await loadMonitorSettings();
    setSettings(loadedSettings);
  }, []);

  const fetchSymbol = useCallback(
    async (adapter: DatasourceAdapter, symbol: SymbolDescriptor) => {
      const symbolInfo = await adapter.resolveSymbol(symbol.id);
      const to = nowUnix();
      const from = to - resolutionToSeconds(settings.resolution) * LOOKBACK_BARS;
      const response = await adapter.getBars(symbolInfo, settings.resolution, {
        from,
        to,
        firstDataRequest: false,
      });

      const record: OhlcvMonitorRecord = {
        id: `${symbol.id}:${settings.resolution}`,
        datasourceId: symbol.datasourceId,
        exchange: symbol.exchange,
        marketType: symbol.marketType,
        symbol: symbol.symbol,
        displayName: symbol.displayName,
        lastUpdated: nowUnix(),
        bars: response.bars,
      };
      return record;
    },
    [settings.resolution],
  );

  const runExchangeWorker = useCallback(
    async (adapter: DatasourceAdapter, runToken: number) => {
      const shouldStop = () => stopRef.current || runTokenRef.current !== runToken;

      updateStatus(adapter.id, {
        state: "initializing",
        lastMessage: "Loading symbols",
      });

      try {
        await adapter.initialize();
        const symbols = adapter.getSymbols();
        setExchangeSymbols((current) => ({
          ...current,
          [adapter.id]: symbols,
        }));
        updateStatus(adapter.id, {
          totalSymbols: symbols.length,
          state: "running",
          lastMessage: "Ready",
        });

        const cached = await readRecordsByDatasource(adapter.id);
        const currentResolutionRecords = cached.filter((record) => record.id.endsWith(`:${settings.resolution}`));
        const localRecordsById = new Map(currentResolutionRecords.map((record) => [record.id, record]));
        setRecordsById((current) => ({
          ...current,
          ...Object.fromEntries(currentResolutionRecords.map((record) => [record.id, record])),
        }));

        while (!shouldStop()) {
          const currentTime = nowUnix();
          const lastExpireScan = lastExpireScanRef.current.get(adapter.id) ?? 0;
          const shouldScanExpired =
            lastExpireScan === 0 || currentTime - lastExpireScan >= EXPIRE_SCAN_INTERVAL_SECONDS;
          let targetSymbols: SymbolDescriptor[] = [];
          let expiredCount = 0;
          let refreshMode: "expired" | "smart" = "smart";

          if (shouldScanExpired) {
            const dueSymbols = symbols.filter((symbol) => {
              const recordId = `${symbol.id}:${settings.resolution}`;
              const localRecord = localRecordsById.get(recordId);
              return !localRecord || currentTime - localRecord.lastUpdated > OUTDATED_AFTER_SECONDS;
            });
            lastExpireScanRef.current.set(adapter.id, currentTime);
            targetSymbols = dueSymbols;
            expiredCount = dueSymbols.length;
            refreshMode = dueSymbols.length > 0 ? "expired" : "smart";
          }

          if (targetSymbols.length === 0) {
            const cursor = rollingCursorRef.current.get(adapter.id) ?? 0;
            const smartWindow = getSmartRefreshSymbols(symbols, cursor);
            targetSymbols = smartWindow.symbols;
            rollingCursorRef.current.set(adapter.id, smartWindow.nextCursor);
            refreshMode = "smart";
          }

          updateStatus(adapter.id, {
            dueSymbols: targetSymbols.length,
            state: targetSymbols.length > 0 ? "running" : "waiting",
            activeBatch: 0,
            lastMessage:
              refreshMode === "expired"
                ? `Fetching ${expiredCount} expired symbols`
                : `Smart refresh ${targetSymbols.length} symbols`,
          });

          if (targetSymbols.length === 0) {
            await sleep(SMART_REFRESH_INTERVAL_SECONDS * 1000, shouldStop);
            continue;
          }

          for (let index = 0; index < targetSymbols.length && !shouldStop(); index += settings.batchSize) {
            const batch = targetSymbols.slice(index, index + settings.batchSize);
            updateStatus(adapter.id, {
              activeBatch: Math.floor(index / settings.batchSize) + 1,
              lastMessage: `${refreshMode === "expired" ? "Expire" : "Smart"} batch ${
                Math.floor(index / settings.batchSize) + 1
              }: ${batch[0]?.symbol ?? ""}`,
            });

            const results = await settleWithConcurrency(batch, 2, (symbol) => fetchSymbol(adapter, symbol));
            const fulfilled = results
              .filter((result): result is PromiseFulfilledResult<OhlcvMonitorRecord> => result.status === "fulfilled")
              .map((result) => result.value)
              .filter((record) => record.bars.length > 0);
            const rejectedCount = results.length - fulfilled.length;

            if (fulfilled.length > 0) {
              await writeOhlcvRecords(fulfilled);
              fulfilled.forEach((record) => {
                localRecordsById.set(record.id, record);
              });
              setRecordsById((current) => ({
                ...current,
                ...Object.fromEntries(fulfilled.map((record) => [record.id, record])),
              }));
            }

            setStatuses((current) => ({
              ...current,
              [adapter.id]: {
                ...current[adapter.id],
                updated: (current[adapter.id]?.updated ?? 0) + fulfilled.length,
                failed: (current[adapter.id]?.failed ?? 0) + rejectedCount,
                dueSymbols: Math.max(targetSymbols.length - index - batch.length, 0),
              },
            }));

            await sleep(BATCH_DELAY_MS, shouldStop);
          }

          await sleep(SMART_REFRESH_INTERVAL_SECONDS * 1000, shouldStop);
        }

        updateStatus(adapter.id, {
          state: "stopped",
          lastMessage: "Stopped",
        });
      } catch (error) {
        updateStatus(adapter.id, {
          state: "error",
          lastMessage: error instanceof Error ? error.message : "Worker failed",
        });
      }
    },
    [fetchSymbol, settings.batchSize, settings.resolution, updateStatus],
  );

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (raw) {
        setFavoriteIds(new Set(JSON.parse(raw) as string[]));
      }
    } catch {
      setFavoriteIds(new Set());
    }
  }, []);

  useEffect(() => {
    const handleSearch = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setQuery(customEvent.detail || "");
    };

    window.addEventListener("mint-monitor-search", handleSearch);
    return () => {
      window.removeEventListener("mint-monitor-search", handleSearch);
    };
  }, []);

  useEffect(() => {
    const runToken = runTokenRef.current + 1;
    runTokenRef.current = runToken;
    stopRef.current = !isRunning;
    if (!isRunning) {
      setStatuses((current) =>
        Object.fromEntries(
          Object.entries(current).map(([datasourceId, status]) => [
            datasourceId,
            { ...status, state: "stopped", lastMessage: "Stopped" },
          ]),
        ),
      );
      return;
    }

    stopRef.current = false;
    setRecordsById({});
    rollingCursorRef.current.clear();
    lastExpireScanRef.current.clear();
    const registry = getDatasourceRegistry();
    const adapters = registry.getAdapters();
    setStatuses(Object.fromEntries(adapters.map((adapter) => [adapter.id, toStatus(adapter)])));
    adapters.forEach((adapter) => {
      void runExchangeWorker(adapter, runToken);
    });

    return () => {
      stopRef.current = true;
    };
  }, [isRunning, settings, runExchangeWorker]);

  const statusList = useMemo(() => Object.values(statuses), [statuses]);
  const allSymbols = useMemo(
    () => Object.values(exchangeSymbols).flat(),
    [exchangeSymbols],
  );
  const loadedCountBySource = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(recordsById).forEach((record) => {
      if (!record.id.endsWith(`:${settings.resolution}`)) return;
      counts[record.datasourceId] = (counts[record.datasourceId] ?? 0) + 1;
    });
    return counts;
  }, [recordsById, settings.resolution]);
  const selectedStatus = selectedSourceId && selectedSourceId !== FAVORITES_SOURCE_ID ? statuses[selectedSourceId] : null;
  const selectedSymbols = useMemo(() => {
    if (selectedSourceId === FAVORITES_SOURCE_ID) {
      return allSymbols.filter((symbol) => favoriteIds.has(symbol.id));
    }
    if (!selectedSourceId) return [];
    return exchangeSymbols[selectedSourceId] ?? [];
  }, [allSymbols, exchangeSymbols, favoriteIds, selectedSourceId]);
  return (
    <div className="h-[calc(100dvh-32px)] min-h-[520px] md:h-[calc(100dvh-48px)]">
      <div className="grid h-full items-stretch gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <SourceRail
          statuses={statusList}
          selectedSourceId={selectedSourceId}
          exchangeSymbols={exchangeSymbols}
          loadedCountBySource={loadedCountBySource}
          favoriteCount={favoriteIds.size}
          onSelectSource={(sourceId) => {
            setSelectedSourceId((current) => (current === sourceId ? null : sourceId));
          }}
        />
        <SymbolCardGrid
          title={selectedSourceId === FAVORITES_SOURCE_ID ? "Favorite" : selectedStatus?.label ?? "Source"}
          status={selectedStatus}
          symbols={selectedSymbols}
          recordsById={recordsById}
          resolution={settings.resolution}
          query={query}
          favoriteIds={favoriteIds}
          onToggleFavorite={(symbolId) => {
            setFavoriteIds((current) => {
              const next = new Set(current);
              if (next.has(symbolId)) {
                next.delete(symbolId);
              } else {
                next.add(symbolId);
              }
              window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...next]));
              return next;
            });
          }}
        />
      </div>
    </div>
  );
}

function SourceRail({
  statuses,
  selectedSourceId,
  exchangeSymbols,
  loadedCountBySource,
  favoriteCount,
  onSelectSource,
}: {
  statuses: ExchangeStatus[];
  selectedSourceId: string | null;
  exchangeSymbols: Record<string, SymbolDescriptor[]>;
  loadedCountBySource: Record<string, number>;
  favoriteCount: number;
  onSelectSource: (sourceId: string) => void;
}) {
  return (
    <aside className="h-full overflow-hidden rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-2 px-2 text-xs font-medium uppercase text-gray-400">Sources</div>
      <div className="h-[calc(100%-28px)] space-y-1 overflow-auto pr-1 custom-scrollbar">
        <SourceButton
          active={selectedSourceId === FAVORITES_SOURCE_ID}
          label="Favorite"
          sublabel="Saved symbols"
          loadedCount={favoriteCount}
          totalCount={favoriteCount}
          state="ready"
          onClick={() => onSelectSource(FAVORITES_SOURCE_ID)}
          favorite
        />
        {statuses.map((status) => (
          <SourceButton
            key={status.datasourceId}
            active={selectedSourceId === status.datasourceId}
            label={status.label}
            sublabel={status.lastMessage}
            loadedCount={loadedCountBySource[status.datasourceId] ?? 0}
            totalCount={exchangeSymbols[status.datasourceId]?.length ?? status.totalSymbols}
            state={status.state}
            onClick={() => onSelectSource(status.datasourceId)}
          />
        ))}
      </div>
    </aside>
  );
}

function SourceButton({
  active,
  label,
  sublabel,
  loadedCount,
  totalCount,
  state,
  favorite = false,
  onClick,
}: {
  active: boolean;
  label: string;
  sublabel: string;
  loadedCount: number;
  totalCount: number;
  state: string;
  favorite?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
        active
          ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
          : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
      }`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${favorite ? "bg-warning-50 text-warning-500" : "bg-gray-100 text-gray-500 dark:bg-white/[0.06]"}`}>
        {favorite ? <StarIcon filled /> : <span className="text-xs font-semibold">{label.slice(0, 2).toUpperCase()}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-gray-400">{sublabel}</span>
      </span>
      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
        {loadedCount}/{totalCount}
      </span>
      <span className={`h-2 w-2 shrink-0 rounded-full ${state === "running" ? "bg-success-500" : state === "error" ? "bg-error-500" : "bg-gray-300"}`} />
    </button>
  );
}

function SymbolCardGrid({
  title,
  status,
  symbols,
  recordsById,
  resolution,
  query,
  favoriteIds,
  onToggleFavorite,
}: {
  title: string;
  status: ExchangeStatus | null;
  symbols: SymbolDescriptor[];
  recordsById: Record<string, OhlcvMonitorRecord>;
  resolution: ResolutionString;
  query: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (symbolId: string) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const normalizedQuery = query.trim().toUpperCase();

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
      setHeight(entry.contentRect.height);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const filteredSymbols = useMemo(() => {
    if (!normalizedQuery) return symbols;
    return symbols.filter((symbol) =>
      [
        symbol.symbol,
        symbol.base,
        symbol.quote,
        symbol.displayName,
        symbol.exchange,
        symbol.datasourceId,
      ]
        .join(" ")
        .toUpperCase()
        .includes(normalizedQuery),
    );
  }, [normalizedQuery, symbols]);
  const columns = width === 0 ? 4 : width >= 1180 ? 4 : width >= 860 ? 3 : width >= 560 ? 2 : 1;
  const rowHeight = MONITOR_CARD_HEIGHT + VIRTUAL_CARD_GAP;
  const totalRows = Math.ceil(filteredSymbols.length / columns);
  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - 2);
  const visibleRows = Math.ceil((height || 680) / rowHeight) + 4;
  const endRow = Math.min(totalRows, startRow + visibleRows);
  const visibleSymbols = filteredSymbols.slice(startRow * columns, endRow * columns);

  if (!title || symbols.length === 0) {
    return (
      <section className="flex h-full min-h-[360px] items-center justify-center rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-white/[0.03]">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">No symbols selected</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Open a source on the left to view its symbol cards.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filteredSymbols.length.toLocaleString()} of {symbols.length.toLocaleString()} symbols
            {status ? ` / ${status.state} / ${status.lastMessage}` : ""}
          </p>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {status ? `Batch ${status.activeBatch || 0} / Queue ${status.dueSymbols}` : "Favorite source"}
        </span>
      </div>

      <div
        ref={containerRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-auto bg-gray-50/60 p-4 custom-scrollbar dark:bg-gray-950/20"
      >
        <div style={{ height: totalRows * rowHeight, position: "relative" }}>
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              position: "absolute",
              top: startRow * rowHeight,
              left: 0,
              right: 0,
            }}
          >
            {visibleSymbols.map((symbol, index) => (
              <SymbolChartCard
                key={`${symbol.id}:${startRow * columns + index}`}
                symbol={symbol}
                record={recordsById[`${symbol.id}:${resolution}`]}
                resolution={resolution}
                favorite={favoriteIds.has(symbol.id)}
                onToggleFavorite={() => onToggleFavorite(symbol.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SymbolChartCard({
  symbol,
  record,
  resolution,
  favorite,
  onToggleFavorite,
}: {
  symbol: SymbolDescriptor;
  record?: OhlcvMonitorRecord;
  resolution: ResolutionString;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const change = record ? getChangePercent(record.bars) : 0;
  const isUp = change >= 0;

  return (
    <div
      className="relative h-[220px] overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-theme-xs transition hover:border-brand-300 hover:shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-500"
    >
      <Link
        href={`/chart?source=${encodeURIComponent(symbol.datasourceId)}&symbol=${encodeURIComponent(symbol.symbol)}&interval=${encodeURIComponent(resolution)}`}
        className="flex h-full flex-col"
      >
        <div className="flex h-8 items-start justify-between gap-3 pr-8">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-5 text-gray-900 dark:text-white">
              {symbol.symbol}-{resolution}
            </h3>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-sm font-semibold leading-5 ${isUp ? "text-success-500" : "text-error-500"}`}>
              {record ? `${change.toFixed(2)}%` : "Waiting"}
            </p>
          </div>
        </div>

        <div className="mt-2 min-h-0 flex-1 rounded-md bg-gray-50 px-2 py-2 dark:bg-white/[0.03]">
          {record ? <MiniLineChart bars={record.bars} height={132} /> : <StaticSkeletonChart />}
        </div>

        <div className="mt-2 flex h-5 items-center justify-between gap-3 text-xs text-gray-400">
          <span className="truncate">{symbol.exchange}</span>
          <span>{record ? `${record.bars.length.toLocaleString()} bars` : "Queued"}</span>
        </div>
      </Link>
      <button
        type="button"
        onClick={onToggleFavorite}
        className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md transition ${
          favorite
            ? "bg-warning-50 text-warning-500 dark:bg-warning-500/15"
            : "text-gray-400 hover:bg-gray-100 hover:text-warning-500 dark:hover:bg-white/[0.06]"
        }`}
        aria-label={favorite ? "Remove from favorite" : "Add to favorite"}
      >
        <StarIcon filled={favorite} />
      </button>
    </div>
  );
}

function StarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} aria-hidden="true">
      <path
        d="M12 3.5L14.6 8.78L20.42 9.63L16.21 13.73L17.2 19.53L12 16.8L6.8 19.53L7.79 13.73L3.58 9.63L9.4 8.78L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StaticSkeletonChart() {
  return (
    <div className="flex h-full w-full items-center rounded-md bg-gray-100 px-2 dark:bg-white/[0.04]">
      <svg viewBox="0 0 180 48" className="h-10 w-full" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 34 L18 28 L36 31 L54 22 L72 27 L90 18 L108 24 L126 14 L144 20 L162 12 L180 16" fill="none" stroke="#D0D5DD" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
