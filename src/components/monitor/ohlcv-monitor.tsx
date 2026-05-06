"use client";

import { MiniLineChart } from "@/components/monitor/mini-line-chart";
import type { SymbolDescriptor } from "@/lib/datasources/types";
import type { ExchangeStatus } from "@/lib/monitor/monitor-engine";
import type { OhlcvMonitorRecord } from "@/lib/monitor/ohlcv-monitor-store";
import { useMonitorWorkerSnapshot } from "@/lib/monitor/monitor-worker-client";
import type { Bar, ResolutionString } from "@/lib/types/charting";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const FAVORITES_SOURCE_ID = "FAVORITES";
const FAVORITES_STORAGE_KEY = "mint-monitor-favorites-v1";
const VIRTUAL_CARD_GAP = 16;
const MONITOR_CARD_HEIGHT = 220;

function getChangePercent(bars: Bar[]) {
  const first = bars.at(-2)?.close;
  const last = bars.at(-1)?.close;
  if (!first || !last) return 0;
  return ((last - first) / first) * 100;
}

export function OhlcvMonitor() {
  const {
    settings,
    statuses,
    exchangeSymbols,
    recordsById,
  } = useMonitorWorkerSnapshot();
  const [query, setQuery] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(FAVORITES_SOURCE_ID);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());

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
