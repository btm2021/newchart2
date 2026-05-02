import { BinanceAdapter } from "@/lib/datasources/binance-adapter";
import { OandaAdapter } from "@/lib/datasources/oanda-adapter";
import type { DatasourceAdapter, MarketType, SymbolDescriptor } from "@/lib/datasources/types";
import type { ResolutionString } from "@/lib/types/charting";

class DatasourceRegistry {
  private readonly adapters = new Map<string, DatasourceAdapter>();
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  register(adapter: DatasourceAdapter) {
    this.adapters.set(adapter.id, adapter);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (!this.initializationPromise) {
      this.initializationPromise = Promise.all(
        [...this.adapters.values()].map((adapter) => adapter.initialize()),
      ).then(() => {
        this.initialized = true;
      });
    }
    await this.initializationPromise;
  }

  getAdapters(): DatasourceAdapter[] {
    return [...this.adapters.values()];
  }

  getAdapter(id: string): DatasourceAdapter | undefined {
    return this.adapters.get(id.toUpperCase());
  }

  getSymbol(fullName: string): SymbolDescriptor | undefined {
    const [datasourceId] = fullName.toUpperCase().split(":");
    return this.getAdapter(datasourceId)?.getSymbols().find((symbol) => symbol.id === fullName.toUpperCase());
  }

  resolveInputSymbol(input: string): string | null {
    const normalized = input.trim().toUpperCase();
    if (!normalized) return null;

    const prefixedAdapter = normalized.includes(":") ? this.getAdapter(normalized.split(":")[0]) : undefined;
    if (prefixedAdapter) {
      return prefixedAdapter.normalizeInputSymbol(normalized);
    }

    const adapters = this.getAdapters();
    for (const adapter of adapters) {
      const resolved = adapter.normalizeInputSymbol(normalized);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  getSymbols(filter?: { marketType?: MarketType }): SymbolDescriptor[] {
    const symbols = this.getAdapters().flatMap((adapter) => adapter.getSymbols());
    if (!filter?.marketType) return symbols;
    return symbols.filter((symbol) => symbol.marketType === filter.marketType);
  }

  getSupportedResolutions(): ResolutionString[] {
    const all = new Set<ResolutionString>();
    this.getAdapters().forEach((adapter) => {
      adapter.supportedResolutions.forEach((resolution) => all.add(resolution));
    });
    return [...all];
  }
}

let singletonRegistry: DatasourceRegistry | null = null;

export function getDatasourceRegistry(): DatasourceRegistry {
  if (!singletonRegistry) {
    singletonRegistry = new DatasourceRegistry();
    singletonRegistry.register(
      new BinanceAdapter("BINANCE_SPOT", "Binance Spot", "spot", {
        baseUrl: "https://api.binance.com/api/v3",
        wsBaseUrl: "wss://stream.binance.com:9443/ws",
        blacklistPatterns: [/BULL/i, /BEAR/i, /UP/i, /DOWN/i],
      }),
    );
    singletonRegistry.register(
      new BinanceAdapter("BINANCE_FUTURES", "Binance Futures", "futures", {
        baseUrl: "https://fapi.binance.com/fapi/v1",
        wsBaseUrl: "wss://fstream.binance.com/ws",
        blacklistPatterns: [/BULL/i, /BEAR/i, /UP/i, /DOWN/i, /_/, /DEFI/i],
      }),
    );
    if (process.env.NEXT_PUBLIC_OANDA_ACCOUNT_ID && process.env.NEXT_PUBLIC_OANDA_TOKEN) {
      singletonRegistry.register(
        new OandaAdapter("OANDA", "OANDA", {
          restUrl: process.env.NEXT_PUBLIC_OANDA_REST_URL || "https://api-fxpractice.oanda.com/v3",
          streamUrl: process.env.NEXT_PUBLIC_OANDA_STREAM_URL || "https://stream-fxpractice.oanda.com/v3",
          accountId: process.env.NEXT_PUBLIC_OANDA_ACCOUNT_ID,
          token: process.env.NEXT_PUBLIC_OANDA_TOKEN,
        }),
      );
    }
  }

  return singletonRegistry;
}
