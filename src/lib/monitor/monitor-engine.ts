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
import type { ResolutionString } from "@/lib/types/charting";

export type ExchangeStatus = {
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

export type MonitorRecordsPatch = Record<string, OhlcvMonitorRecord>;
export type MonitorSymbolsBySource = Record<string, SymbolDescriptor[]>;
export type MonitorStatusesBySource = Record<string, ExchangeStatus>;

type MonitorEngineCallbacks = {
  onSettings?: (settings: MonitorSettings) => void;
  onStatuses?: (statuses: MonitorStatusesBySource) => void;
  onSymbols?: (symbols: MonitorSymbolsBySource) => void;
  onRecords?: (records: MonitorRecordsPatch) => void;
  onError?: (message: string) => void;
};

const BATCH_DELAY_MS = 3_000;
const LOOKBACK_BARS = 1500;
const EXPIRE_SCAN_INTERVAL_SECONDS = 15 * 60;
const OUTDATED_AFTER_SECONDS = 15 * 60;
const SMART_REFRESH_INTERVAL_SECONDS = 60;
const SMART_REFRESH_DIVISOR = 30;

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
      globalThis.setTimeout(tick, 150);
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

export class OhlcvMonitorEngine {
  private settings: MonitorSettings = defaultMonitorSettings;
  private statuses: MonitorStatusesBySource = {};
  private symbolsBySource: MonitorSymbolsBySource = {};
  private stopRequested = false;
  private runToken = 0;
  private started = false;
  private readonly rollingCursor = new Map<string, number>();
  private readonly lastExpireScan = new Map<string, number>();

  constructor(private readonly callbacks: MonitorEngineCallbacks = {}) {}

  async start() {
    if (this.started) return;
    this.started = true;
    this.stopRequested = false;
    this.runToken += 1;
    const currentRunToken = this.runToken;

    try {
      this.settings = await loadMonitorSettings();
      this.callbacks.onSettings?.(this.settings);

      const registry = getDatasourceRegistry();
      const adapters = registry.getAdapters();
      this.statuses = Object.fromEntries(adapters.map((adapter) => [adapter.id, toStatus(adapter)]));
      this.callbacks.onStatuses?.(this.statuses);

      adapters.forEach((adapter) => {
        void this.runExchangeWorker(adapter, currentRunToken);
      });
    } catch (error) {
      this.callbacks.onError?.(error instanceof Error ? error.message : "Monitor engine failed to start.");
    }
  }

  stop() {
    this.started = false;
    this.stopRequested = true;
    this.runToken += 1;
    this.statuses = Object.fromEntries(
      Object.entries(this.statuses).map(([datasourceId, status]) => [
        datasourceId,
        { ...status, state: "stopped", lastMessage: "Stopped" },
      ]),
    );
    this.callbacks.onStatuses?.(this.statuses);
  }

  private updateStatus(datasourceId: string, patch: Partial<ExchangeStatus>) {
    this.statuses = {
      ...this.statuses,
      [datasourceId]: {
        ...this.statuses[datasourceId],
        ...patch,
      },
    };
    this.callbacks.onStatuses?.(this.statuses);
  }

  private updateSymbols(datasourceId: string, symbols: SymbolDescriptor[]) {
    this.symbolsBySource = {
      ...this.symbolsBySource,
      [datasourceId]: symbols,
    };
    this.callbacks.onSymbols?.(this.symbolsBySource);
  }

  private async fetchSymbol(adapter: DatasourceAdapter, symbol: SymbolDescriptor) {
    const symbolInfo = await adapter.resolveSymbol(symbol.id);
    const to = nowUnix();
    const from = to - resolutionToSeconds(this.settings.resolution) * LOOKBACK_BARS;
    const response = await adapter.getBars(symbolInfo, this.settings.resolution, {
      from,
      to,
      firstDataRequest: false,
    });

    const record: OhlcvMonitorRecord = {
      id: `${symbol.id}:${this.settings.resolution}`,
      datasourceId: symbol.datasourceId,
      exchange: symbol.exchange,
      marketType: symbol.marketType,
      symbol: symbol.symbol,
      displayName: symbol.displayName,
      lastUpdated: nowUnix(),
      bars: response.bars,
    };
    return record;
  }

  private async runExchangeWorker(adapter: DatasourceAdapter, runToken: number) {
    const shouldStop = () => this.stopRequested || this.runToken !== runToken;

    this.updateStatus(adapter.id, {
      state: "initializing",
      lastMessage: "Loading symbols",
    });

    try {
      await adapter.initialize();
      const symbols = adapter.getSymbols();
      this.updateSymbols(adapter.id, symbols);
      this.updateStatus(adapter.id, {
        totalSymbols: symbols.length,
        state: "running",
        lastMessage: "Ready",
      });

      const cached = await readRecordsByDatasource(adapter.id);
      const currentResolutionRecords = cached.filter((record) => record.id.endsWith(`:${this.settings.resolution}`));
      const localRecordsById = new Map(currentResolutionRecords.map((record) => [record.id, record]));
      this.callbacks.onRecords?.(Object.fromEntries(currentResolutionRecords.map((record) => [record.id, record])));

      while (!shouldStop()) {
        const currentTime = nowUnix();
        const lastExpireScan = this.lastExpireScan.get(adapter.id) ?? 0;
        const shouldScanExpired =
          lastExpireScan === 0 || currentTime - lastExpireScan >= EXPIRE_SCAN_INTERVAL_SECONDS;
        let targetSymbols: SymbolDescriptor[] = [];
        let expiredCount = 0;
        let refreshMode: "expired" | "smart" = "smart";

        if (shouldScanExpired) {
          const dueSymbols = symbols.filter((symbol) => {
            const recordId = `${symbol.id}:${this.settings.resolution}`;
            const localRecord = localRecordsById.get(recordId);
            return !localRecord || currentTime - localRecord.lastUpdated > OUTDATED_AFTER_SECONDS;
          });
          this.lastExpireScan.set(adapter.id, currentTime);
          targetSymbols = dueSymbols;
          expiredCount = dueSymbols.length;
          refreshMode = dueSymbols.length > 0 ? "expired" : "smart";
        }

        if (targetSymbols.length === 0) {
          const cursor = this.rollingCursor.get(adapter.id) ?? 0;
          const smartWindow = getSmartRefreshSymbols(symbols, cursor);
          targetSymbols = smartWindow.symbols;
          this.rollingCursor.set(adapter.id, smartWindow.nextCursor);
          refreshMode = "smart";
        }

        this.updateStatus(adapter.id, {
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

        for (let index = 0; index < targetSymbols.length && !shouldStop(); index += this.settings.batchSize) {
          const batch = targetSymbols.slice(index, index + this.settings.batchSize);
          this.updateStatus(adapter.id, {
            activeBatch: Math.floor(index / this.settings.batchSize) + 1,
            lastMessage: `${refreshMode === "expired" ? "Expire" : "Smart"} batch ${
              Math.floor(index / this.settings.batchSize) + 1
            }: ${batch[0]?.symbol ?? ""}`,
          });

          const results = await settleWithConcurrency(batch, 2, (symbol) => this.fetchSymbol(adapter, symbol));
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
            this.callbacks.onRecords?.(Object.fromEntries(fulfilled.map((record) => [record.id, record])));
          }

          const currentStatus = this.statuses[adapter.id];
          this.updateStatus(adapter.id, {
            updated: (currentStatus?.updated ?? 0) + fulfilled.length,
            failed: (currentStatus?.failed ?? 0) + rejectedCount,
            dueSymbols: Math.max(targetSymbols.length - index - batch.length, 0),
          });

          await sleep(BATCH_DELAY_MS, shouldStop);
        }

        await sleep(SMART_REFRESH_INTERVAL_SECONDS * 1000, shouldStop);
      }

      this.updateStatus(adapter.id, {
        state: "stopped",
        lastMessage: "Stopped",
      });
    } catch (error) {
      this.updateStatus(adapter.id, {
        state: "error",
        lastMessage: error instanceof Error ? error.message : "Worker failed",
      });
    }
  }
}
