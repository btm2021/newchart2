"use client";

import { MiniLineChart } from "@/components/monitor/mini-line-chart";
import {
  isInvalidFavoriteAccountSession,
  loadFavoriteSymbolIds,
  saveFavoriteSymbolIds,
} from "@/lib/accounts/favorite-symbols-client";
import { clearBrowserSession } from "@/lib/auth/browser-auth";
import { loadMonitorSettings } from "@/lib/monitor/monitor-settings";
import {
  readOhlcvRecordsByIds,
  type OhlcvMonitorRecord,
} from "@/lib/monitor/ohlcv-monitor-store";
import type { Bar } from "@/lib/types/charting";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function getChangePercent(bars: Bar[]) {
  const first = bars.at(-2)?.close;
  const last = bars.at(-1)?.close;
  if (!first || !last) return 0;
  return ((last - first) / first) * 100;
}

export function FavoriteSymbolsPanel() {
  const router = useRouter();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [cachedRecords, setCachedRecords] = useState<OhlcvMonitorRecord[]>([]);
  const [favoriteError, setFavoriteError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadCachedFavorites() {
      try {
        const [ids, settings] = await Promise.all([
          loadFavoriteSymbolIds(),
          loadMonitorSettings(),
        ]);
        const records = await readOhlcvRecordsByIds(ids.map((id) => `${id}:${settings.resolution}`));
        if (mounted) {
          setFavoriteIds(new Set(ids));
          setCachedRecords(records);
          setFavoriteError("");
        }
      } catch (error) {
        if (mounted) {
          if (isInvalidFavoriteAccountSession(error)) {
            clearBrowserSession();
            router.replace("/login?next=/favorite");
            router.refresh();
            return;
          }

          setFavoriteIds(new Set());
          setCachedRecords([]);
          setFavoriteError(error instanceof Error ? error.message : "Could not load favorites.");
        }
      }
    }

    void loadCachedFavorites();

    return () => {
      mounted = false;
    };
  }, [router]);

  const favoriteRecords = useMemo(
    () => cachedRecords.filter((record) => favoriteIds.has(record.id.split(":").slice(0, -1).join(":"))),
    [cachedRecords, favoriteIds],
  );

  function removeFavorite(symbolId: string) {
    const previous = favoriteIds;
    const previousRecords = cachedRecords;
    const next = new Set(previous);
    next.delete(symbolId);

    setFavoriteIds(next);
    setCachedRecords((current) => current.filter((record) => record.id.split(":").slice(0, -1).join(":") !== symbolId));
    setFavoriteError("");
    void saveFavoriteSymbolIds([...next]).catch((error) => {
      if (isInvalidFavoriteAccountSession(error)) {
        clearBrowserSession();
        router.replace("/login?next=/favorite");
        router.refresh();
        return;
      }

      setFavoriteError(error instanceof Error ? error.message : "Could not save favorites.");
      setFavoriteIds(previous);
      setCachedRecords(previousRecords);
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

      {favoriteRecords.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {favoriteRecords.map((record) => (
            <FavoriteSymbolCard
              key={record.id}
              record={record}
              onRemove={() => removeFavorite(getSymbolIdFromRecordId(record.id))}
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {favoriteIds.size > 0 ? "No cached favorites yet" : "No favorites yet"}
            </h2>
            <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
              {favoriteIds.size > 0
                ? "Favorite only shows OHLCV already saved in the local monitor cache."
                : "Open Monitor and click the star on any symbol card to add it here."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function getSymbolIdFromRecordId(recordId: string) {
  return recordId.split(":").slice(0, -1).join(":");
}

function FavoriteSymbolCard({
  record,
  onRemove,
}: {
  record: OhlcvMonitorRecord;
  onRemove: () => void;
}) {
  const resolution = record.id.split(":").at(-1) ?? "";
  const change = getChangePercent(record.bars);
  const isUp = change >= 0;
  const lastClose = record.bars.at(-1)?.close;

  return (
    <div className="relative h-[220px] overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-theme-xs transition hover:border-brand-300 hover:shadow-theme-sm dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-500">
      <Link
        href={`/chart?source=${encodeURIComponent(record.datasourceId)}&symbol=${encodeURIComponent(record.symbol)}&interval=${encodeURIComponent(resolution)}`}
        className="flex h-full flex-col"
      >
        <div className="flex h-9 items-start justify-between gap-3 pr-8">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-5 text-gray-900 dark:text-white">
              {record.symbol}-{resolution}
            </h3>
            <p className="truncate text-xs text-gray-400">{record.exchange}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-sm font-semibold leading-5 ${isUp ? "text-success-500" : "text-error-500"}`}>
              {`${change.toFixed(2)}%`}
            </p>
            <p className="text-xs text-gray-400">{lastClose ? lastClose.toLocaleString() : "Cached"}</p>
          </div>
        </div>

        <div className="mt-2 min-h-0 flex-1 rounded-md bg-gray-50 px-2 py-2 dark:bg-white/[0.03]">
          <MiniLineChart bars={record.bars} height={128} />
        </div>

        <div className="mt-2 flex h-5 items-center justify-between gap-3 text-xs text-gray-400">
          <span className="truncate">{record.datasourceId.replace("_", " ")}</span>
          <span>{record.bars.length.toLocaleString()} bars</span>
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
