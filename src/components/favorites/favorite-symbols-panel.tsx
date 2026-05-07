"use client";

import { MiniLineChart } from "@/components/monitor/mini-line-chart";
import { loadFavoriteSymbolIds, saveFavoriteSymbolIds } from "@/lib/accounts/favorite-symbols-client";
import { useMonitorWorkerSnapshot } from "@/lib/monitor/monitor-worker-client";
import type { OhlcvMonitorRecord } from "@/lib/monitor/ohlcv-monitor-store";
import type { SymbolDescriptor } from "@/lib/datasources/types";
import type { Bar } from "@/lib/types/charting";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function getChangePercent(bars: Bar[]) {
  const first = bars.at(-2)?.close;
  const last = bars.at(-1)?.close;
  if (!first || !last) return 0;
  return ((last - first) / first) * 100;
}

export function FavoriteSymbolsPanel() {
  const { settings, exchangeSymbols, recordsById } = useMonitorWorkerSnapshot();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [favoriteError, setFavoriteError] = useState("");

  useEffect(() => {
    let mounted = true;

    void loadFavoriteSymbolIds()
      .then((ids) => {
        if (mounted) {
          setFavoriteIds(new Set(ids));
          setFavoriteError("");
        }
      })
      .catch((error) => {
        if (mounted) {
          setFavoriteIds(new Set());
          setFavoriteError(error instanceof Error ? error.message : "Could not load favorites.");
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const allSymbols = useMemo(() => Object.values(exchangeSymbols).flat(), [exchangeSymbols]);
  const favoriteSymbols = useMemo(
    () => allSymbols.filter((symbol) => favoriteIds.has(symbol.id)),
    [allSymbols, favoriteIds],
  );
  const isLoadingFavorites = favoriteIds.size > 0 && favoriteSymbols.length === 0 && allSymbols.length === 0;

  function removeFavorite(symbolId: string) {
    const previous = favoriteIds;
    const next = new Set(previous);
    next.delete(symbolId);

    setFavoriteIds(next);
    setFavoriteError("");
    void saveFavoriteSymbolIds([...next]).catch((error) => {
      setFavoriteError(error instanceof Error ? error.message : "Could not save favorites.");
      setFavoriteIds(previous);
    });
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Favorite</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Your saved monitor symbols, shown as chart cards.
            </p>
            {favoriteError ? (
              <p className="mt-2 text-sm text-error-500">{favoriteError}</p>
            ) : null}
          </div>
          <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {favoriteIds.size.toLocaleString()} symbols
          </span>
        </div>
      </div>

      {isLoadingFavorites ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[220px] rounded-lg border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="h-5 w-28 rounded bg-gray-100 dark:bg-white/[0.06]" />
              <div className="mt-4 h-[132px] rounded-md bg-gray-100 dark:bg-white/[0.04]" />
              <div className="mt-3 h-4 w-36 rounded bg-gray-100 dark:bg-white/[0.06]" />
            </div>
          ))}
        </div>
      ) : favoriteSymbols.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {favoriteSymbols.map((symbol) => (
            <FavoriteSymbolCard
              key={symbol.id}
              symbol={symbol}
              record={recordsById[`${symbol.id}:${settings.resolution}`]}
              resolution={settings.resolution}
              onRemove={() => removeFavorite(symbol.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">No favorites yet</h2>
            <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
              Open Monitor and click the star on any symbol card to add it here.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function FavoriteSymbolCard({
  symbol,
  record,
  resolution,
  onRemove,
}: {
  symbol: SymbolDescriptor;
  record?: OhlcvMonitorRecord;
  resolution: string;
  onRemove: () => void;
}) {
  const change = record ? getChangePercent(record.bars) : 0;
  const isUp = change >= 0;
  const lastClose = record?.bars.at(-1)?.close;

  return (
    <div className="relative h-[220px] overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-theme-xs transition hover:border-brand-300 hover:shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-500">
      <Link
        href={`/chart?source=${encodeURIComponent(symbol.datasourceId)}&symbol=${encodeURIComponent(symbol.symbol)}&interval=${encodeURIComponent(resolution)}`}
        className="flex h-full flex-col"
      >
        <div className="flex h-9 items-start justify-between gap-3 pr-8">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-5 text-gray-900 dark:text-white">
              {symbol.symbol}-{resolution}
            </h3>
            <p className="truncate text-xs text-gray-400">{symbol.exchange}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-sm font-semibold leading-5 ${isUp ? "text-success-500" : "text-error-500"}`}>
              {record ? `${change.toFixed(2)}%` : "Waiting"}
            </p>
            <p className="text-xs text-gray-400">{lastClose ? lastClose.toLocaleString() : "Queued"}</p>
          </div>
        </div>

        <div className="mt-2 min-h-0 flex-1 rounded-md bg-gray-50 px-2 py-2 dark:bg-white/[0.03]">
          {record ? <MiniLineChart bars={record.bars} height={128} /> : <StaticSkeletonChart />}
        </div>

        <div className="mt-2 flex h-5 items-center justify-between gap-3 text-xs text-gray-400">
          <span className="truncate">{symbol.datasourceId.replace("_", " ")}</span>
          <span>{record ? `${record.bars.length.toLocaleString()} bars` : "Syncing"}</span>
        </div>
      </Link>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-md bg-warning-50 text-warning-500 transition hover:bg-warning-100 dark:bg-warning-500/15"
        aria-label="Remove from favorite"
      >
        <StarIcon />
      </button>
    </div>
  );
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
