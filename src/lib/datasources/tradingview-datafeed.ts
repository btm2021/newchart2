import { getDatasourceRegistry } from "@/lib/datasources/registry";
import type { DatasourceAdapter } from "@/lib/datasources/types";
import type { Bar, HistoryMetadata, LibrarySymbolInfo, ResolutionString, SearchSymbolResultItem } from "@/lib/types/charting";

type PriceDirection = "up" | "down" | "flat";

export type PriceUpdate = {
  symbol: string;
  price: number;
  direction: PriceDirection;
};

export class TradingViewDatafeed {
  private readonly registry = getDatasourceRegistry();
  private readonly latestPrices = new Map<string, number>();
  private readonly priceListeners = new Set<(update: PriceUpdate) => void>();

  onReady(callback: (config: {
    supported_resolutions: string[];
    exchanges: Array<{ value: string; name: string; desc: string }>;
    symbols_types: Array<{ name: string; value: string }>;
    supports_marks: boolean;
    supports_timescale_marks: boolean;
    supports_time: boolean;
  }) => void): void {
    this.registry.initialize().then(() => {
      callback({
        supported_resolutions: this.registry.getSupportedResolutions(),
        exchanges: [
          {
            value: "ALL",
            name: "All Sources",
            desc: "All Sources",
          },
          ...this.registry.getAdapters().map((adapter) => ({
            value: adapter.id,
            name: adapter.label,
            desc: adapter.label,
          })),
        ],
        symbols_types: [
          { name: "All", value: "all" },
          { name: "Spot", value: "spot" },
          { name: "Futures", value: "futures" },
          { name: "Forex", value: "forex" },
        ],
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true,
      });
    });
  }

  searchSymbols(
    userInput: string,
    exchange: string,
    symbolType: string,
    onResultReadyCallback: (symbols: SearchSymbolResultItem[]) => void,
  ): void {
    this.registry
      .initialize()
      .then(() => {
        const { query, forcedExchange } = this.parseSearchInput(userInput);
        const adapters = this.getFilteredAdapters(forcedExchange || exchange, symbolType);
        const symbols = adapters.flatMap((adapter) => adapter.searchSymbols(query))
          .map((symbol) => this.decorateSearchResult(symbol))
          .slice(0, 100);
        onResultReadyCallback(symbols);
      })
      .catch(() => onResultReadyCallback([]));
  }

  resolveSymbol(
    symbolName: string,
    onSymbolResolvedCallback: (symbolInfo: LibrarySymbolInfo) => void,
    onResolveErrorCallback: (reason: string) => void,
  ): void {
    this.registry
      .initialize()
      .then(async () => {
        const normalizedSymbol = this.normalizeSymbolName(symbolName);
        const adapter = this.getAdapterFromSymbol(normalizedSymbol);
        if (!adapter) {
          onResolveErrorCallback(`Unknown datasource for ${symbolName}`);
          return;
        }
        const symbolInfo = await adapter.resolveSymbol(normalizedSymbol);
        onSymbolResolvedCallback(symbolInfo);
      })
      .catch((error) => onResolveErrorCallback(error instanceof Error ? error.message : "Could not resolve symbol"));
  }

  getBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: string,
    periodParams: { from: number; to: number; firstDataRequest: boolean },
    onHistoryCallback: (bars: Awaited<ReturnType<DatasourceAdapter["getBars"]>>["bars"], meta: HistoryMetadata) => void,
    onErrorCallback: (reason: string) => void,
  ): void {
    this.registry
      .initialize()
      .then(async () => {
        const adapter = this.getAdapterFromSymbol(symbolInfo.full_name);
        if (!adapter) throw new Error(`Unknown datasource for ${symbolInfo.full_name}`);
        const response = await adapter.getBars(symbolInfo, resolution as ResolutionString, periodParams);
        this.publishHistoryPrice(symbolInfo.full_name, response.bars);
        onHistoryCallback(response.bars, response.meta);
      })
      .catch((error) => onErrorCallback(error instanceof Error ? error.message : "Could not load bars"));
  }

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: string,
    onRealtimeCallback: Parameters<DatasourceAdapter["subscribeBars"]>[2],
    subscriberUID: string,
    onResetCacheNeededCallback: () => void,
  ): void {
    this.registry
      .initialize()
      .then(() => {
        const adapter = this.getAdapterFromSymbol(symbolInfo.full_name);
        adapter?.subscribeBars(
          symbolInfo,
          resolution as ResolutionString,
          (bar) => {
            this.publishRealtimePrice(symbolInfo.full_name, bar);
            onRealtimeCallback(bar);
          },
          subscriberUID,
          onResetCacheNeededCallback,
        );
      })
      .catch(() => undefined);
  }

  unsubscribeBars(subscriberUID: string): void {
    this.registry.getAdapters().forEach((adapter) => adapter.unsubscribeBars(subscriberUID));
  }

  subscribePriceUpdates(listener: (update: PriceUpdate) => void): () => void {
    this.priceListeners.add(listener);
    return () => {
      this.priceListeners.delete(listener);
    };
  }

  private getFilteredAdapters(exchange: string, symbolType: string): DatasourceAdapter[] {
    const adapters = this.registry.getAdapters();
    return adapters.filter((adapter) => {
      const exchangeMatch = !exchange || exchange === "ALL" || adapter.id === exchange;
      const marketMatch = !symbolType || symbolType === "all" || adapter.marketType === symbolType;
      return exchangeMatch && marketMatch;
    });
  }

  private getAdapterFromSymbol(symbolName: string): DatasourceAdapter | undefined {
    const [datasourceId] = symbolName.toUpperCase().split(":");
    return this.registry.getAdapter(datasourceId);
  }

  private parseSearchInput(userInput: string) {
    const raw = userInput.trim().toUpperCase();
    if (raw.endsWith(".P")) {
      return {
        query: raw.slice(0, -2),
        forcedExchange: "BINANCE_FUTURES",
      };
    }
    if (raw.endsWith(".S")) {
      return {
        query: raw.slice(0, -2),
        forcedExchange: "BINANCE_SPOT",
      };
    }
    return {
      query: raw,
      forcedExchange: "",
    };
  }

  private decorateSearchResult(symbol: SearchSymbolResultItem): SearchSymbolResultItem {
    if (symbol.full_name.startsWith("BINANCE_FUTURES:")) {
      return {
        ...symbol,
        symbol: `${symbol.symbol}.P`,
      };
    }
    return symbol;
  }

  private normalizeSymbolName(symbolName: string): string {
    const upper = symbolName.trim().toUpperCase();
    const resolved = this.registry.resolveInputSymbol(upper);
    if (resolved) {
      return resolved;
    }
    if (upper.endsWith(".P")) {
      return `BINANCE_FUTURES:${upper.slice(0, -2)}`;
    }
    if (upper.endsWith(".S")) {
      return `BINANCE_SPOT:${upper.slice(0, -2)}`;
    }
    return `BINANCE_SPOT:${upper}`;
  }

  private publishHistoryPrice(symbol: string, bars: Bar[]): void {
    if (bars.length === 0) {
      return;
    }
    const lastBar = bars[bars.length - 1];
    const previousPrice = bars.length > 1 ? bars[bars.length - 2].close : this.latestPrices.get(symbol);
    this.latestPrices.set(symbol, lastBar.close);
    this.emitPriceUpdate({
      symbol,
      price: lastBar.close,
      direction: this.getDirection(lastBar.close, previousPrice),
    });
  }

  private publishRealtimePrice(symbol: string, bar: Bar): void {
    const previousPrice = this.latestPrices.get(symbol);
    this.latestPrices.set(symbol, bar.close);
    this.emitPriceUpdate({
      symbol,
      price: bar.close,
      direction: this.getDirection(bar.close, previousPrice),
    });
  }

  private emitPriceUpdate(update: PriceUpdate): void {
    this.priceListeners.forEach((listener) => listener(update));
  }

  private getDirection(price: number, previousPrice?: number): PriceDirection {
    if (typeof previousPrice !== "number") {
      return "flat";
    }
    if (price > previousPrice) {
      return "up";
    }
    if (price < previousPrice) {
      return "down";
    }
    return "flat";
  }
}
