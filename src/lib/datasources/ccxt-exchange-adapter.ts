import ccxt from "ccxt";
import { BaseDatasourceAdapter } from "@/lib/datasources/base-adapter";
import type { BarsRequest, MarketType, SymbolDescriptor } from "@/lib/datasources/types";
import { readSymbolCache, writeSymbolCache } from "@/lib/storage/symbol-cache";
import type { Bar, LibrarySymbolInfo, ResolutionString, SearchSymbolResultItem } from "@/lib/types/charting";

const RESOLUTION_TO_TIMEFRAME: Record<ResolutionString, string> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "240": "4h",
  "1D": "1d",
  "1W": "1w",
  "1M": "1M",
};

const SUPPORTED_RESOLUTIONS: ResolutionString[] = ["1", "5", "15", "30", "60", "240", "1D", "1W", "1M"];

type CcxtConstructor = new (config?: Record<string, unknown>) => CcxtExchange;

type CcxtMarket = {
  id: string;
  symbol: string;
  base?: string;
  quote?: string;
  active?: boolean;
  spot?: boolean;
  swap?: boolean;
  future?: boolean;
  contract?: boolean;
  precision?: {
    price?: number;
    amount?: number;
  };
  limits?: {
    price?: {
      min?: number;
    };
  };
  info?: unknown;
};

type CcxtExchange = {
  id: string;
  markets?: Record<string, CcxtMarket>;
  symbols?: string[];
  has?: Record<string, unknown>;
  loadMarkets(): Promise<Record<string, CcxtMarket>>;
  fetchOHLCV(symbol: string, timeframe?: string, since?: number, limit?: number, params?: Record<string, unknown>): Promise<unknown[][]>;
  watchOHLCV?: (symbol: string, timeframe?: string, since?: number, limit?: number, params?: Record<string, unknown>) => Promise<unknown[]>;
  close?: () => Promise<void>;
};

type SubscriberRecord = {
  stopped: boolean;
};

export type CcxtExchangeOptions = {
  ccxtId: keyof typeof ccxt;
  defaultType?: "spot" | "future" | "swap";
  labelSuffix?: string;
  swapOnly?: boolean;
  blacklistPatterns?: RegExp[];
};

export abstract class CcxtExchangeAdapter extends BaseDatasourceAdapter {
  public readonly supportedResolutions = SUPPORTED_RESOLUTIONS;

  private readonly quotePriority = new Map([
    ["USDT", 3],
    ["USDC", 2],
    ["BTC", 1],
  ]);
  private readonly subscribers = new Map<string, SubscriberRecord>();
  private initialized = false;
  private symbols: SymbolDescriptor[] = [];
  private symbolMap = new Map<string, SymbolDescriptor>();
  private priceScaleMap = new Map<string, number>();
  private exchange: CcxtExchange | null = null;

  constructor(
    id: string,
    label: string,
    marketType: MarketType,
    private readonly options: CcxtExchangeOptions,
  ) {
    super(id, label, marketType);
  }

  override normalizeInputSymbol(input: string) {
    const upper = input.trim().toUpperCase();
    if (!upper) return null;

    if (upper.startsWith(`${this.id}:`)) {
      const symbolPart = upper.slice(this.id.length + 1);
      const normalizedPair = symbolPart.includes("/") ? symbolPart : this.compactToPair(symbolPart);
      const symbol = this.getSymbols().find((item) => item.id === upper || item.symbol === normalizedPair || item.symbol.replace("/", "") === symbolPart);
      return symbol?.id ?? `${this.id}:${normalizedPair}`;
    }

    const normalizedPair = upper.includes("/") ? upper : this.compactToPair(upper);
    const symbol = this.getSymbols().find((item) => (
      item.symbol === normalizedPair ||
      item.symbol.replace("/", "") === upper ||
      item.symbol === upper
    ));
    return symbol?.id ?? null;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const cachedSymbols = await readSymbolCache<SymbolDescriptor>(this.getCacheKey(), 1000 * 60 * 60 * 12);
    if (cachedSymbols.length > 0) {
      this.hydrateMaps(cachedSymbols);
      this.initialized = true;
      return;
    }

    const exchange = this.getExchange();
    const markets = await exchange.loadMarkets();
    const descriptors = Object.values(markets)
      .filter((market) => this.isTradableMarket(market))
      .map((market) => this.toDescriptor(market))
      .filter((descriptor, index, all) => all.findIndex((item) => item.id === descriptor.id) === index)
      .sort((a, b) => this.scoreSymbol(b, "") - this.scoreSymbol(a, ""));

    this.hydrateMaps(descriptors);
    await writeSymbolCache(this.getCacheKey(), descriptors);
    this.initialized = true;
  }

  getSymbols(): SymbolDescriptor[] {
    return this.symbols;
  }

  searchSymbols(query: string): SearchSymbolResultItem[] {
    const normalized = query.trim().toUpperCase();
    return this.getSymbols()
      .filter((item) => {
        if (!normalized) return true;
        return item.symbol.includes(normalized) || item.symbol.replace("/", "").includes(normalized) || item.base.includes(normalized) || item.quote.includes(normalized);
      })
      .map((item) => ({
        item,
        score: this.scoreSymbol(item, normalized),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
      .map(({ item }) => ({
        symbol: item.symbol,
        full_name: item.id,
        description: item.displayName,
        exchange: this.label,
        type: "crypto",
      }));
  }

  async resolveSymbol(fullName: string): Promise<LibrarySymbolInfo> {
    await this.initialize();

    const descriptor = this.symbolMap.get(fullName.toUpperCase());
    if (!descriptor) {
      throw new Error(`Unsupported symbol: ${fullName}`);
    }

    return {
      name: descriptor.symbol,
      full_name: descriptor.id,
      ticker: descriptor.id,
      description: descriptor.displayName,
      type: "crypto",
      session: "24x7",
      timezone: "Etc/UTC",
      exchange: this.label,
      listed_exchange: this.label,
      minmov: 1,
      pricescale: this.priceScaleMap.get(descriptor.id) ?? 100,
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: true,
      supported_resolutions: this.supportedResolutions,
      volume_precision: 3,
      data_status: this.getExchange().watchOHLCV ? "streaming" : "endofday",
    };
  }

  async getBars(symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, range: BarsRequest): Promise<{ bars: Bar[]; meta: { noData: boolean } }> {
    await this.initialize();

    const descriptor = this.symbolMap.get(symbolInfo.full_name.toUpperCase());
    const symbol = descriptor?.symbol ?? this.parseDatasourceSymbol(symbolInfo.full_name);
    const timeframe = RESOLUTION_TO_TIMEFRAME[resolution];
    const since = range.from * 1000;
    const limit = Math.min(Math.max(Math.ceil((range.to - range.from) / this.resolutionToSeconds(resolution)) + 2, 1), 1000);
    const rows = await this.getExchange().fetchOHLCV(symbol, timeframe, since, limit);
    const bars = rows.map((row) => this.normalizeOhlcv(row)).filter((bar) => bar.time / 1000 <= range.to);

    return {
      bars,
      meta: { noData: bars.length === 0 },
    };
  }

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onRealtimeCallback: (bar: Bar) => void,
    subscriberUID: string,
    onResetCacheNeededCallback?: () => void,
  ): void {
    const exchange = this.getExchange();
    const descriptor = this.symbolMap.get(symbolInfo.full_name.toUpperCase());
    const symbol = descriptor?.symbol ?? this.parseDatasourceSymbol(symbolInfo.full_name);
    const timeframe = RESOLUTION_TO_TIMEFRAME[resolution];

    if (!exchange.watchOHLCV) {
      return;
    }

    const subscriber: SubscriberRecord = { stopped: false };
    this.subscribers.set(subscriberUID, subscriber);

    const loop = async () => {
      while (!subscriber.stopped) {
        try {
          const row = await exchange.watchOHLCV?.(symbol, timeframe);
          if (Array.isArray(row) && row.length > 0) {
            const last = (Array.isArray(row[0]) ? row.at(-1) : row) as unknown[];
            if (last) {
              onRealtimeCallback(this.normalizeOhlcv(last));
            }
          }
        } catch {
          onResetCacheNeededCallback?.();
          await this.sleep(1200);
        }
      }
    };

    void loop();
  }

  unsubscribeBars(subscriberUID: string): void {
    const subscriber = this.subscribers.get(subscriberUID);
    if (!subscriber) return;
    subscriber.stopped = true;
    this.subscribers.delete(subscriberUID);
  }

  protected getExchange(): CcxtExchange {
    if (this.exchange) return this.exchange;

    const namespace = ((ccxt as unknown as { pro?: Record<string, CcxtConstructor> }).pro ?? ccxt) as Record<string, CcxtConstructor>;
    const ExchangeConstructor = namespace[this.options.ccxtId as string];
    if (!ExchangeConstructor) {
      throw new Error(`CCXT exchange is not available: ${String(this.options.ccxtId)}`);
    }

    this.exchange = new ExchangeConstructor({
      enableRateLimit: true,
      options: {
        defaultType: this.options.defaultType,
      },
    });

    return this.exchange;
  }

  private hydrateMaps(symbols: SymbolDescriptor[]) {
    this.symbols = symbols;
    this.symbolMap = new Map(symbols.map((symbol) => [symbol.id, symbol]));
    this.priceScaleMap = new Map(symbols.map((symbol) => [symbol.id, symbol.priceScale ?? 100]));
  }

  private isTradableMarket(market: CcxtMarket): boolean {
    if (market.active === false) return false;
    if (!market.base || !market.quote) return false;
    if (market.quote.toUpperCase() !== "USDT") return false;
    if (this.options.blacklistPatterns?.some((pattern) => pattern.test(market.symbol) || pattern.test(market.id))) return false;

    if (this.marketType === "spot") {
      return market.spot === true;
    }

    if (this.marketType === "futures") {
      if (this.options.swapOnly) {
        return market.swap === true;
      }
      return market.swap === true || market.future === true || market.contract === true;
    }

    return true;
  }

  private toDescriptor(market: CcxtMarket): SymbolDescriptor {
    const pair = `${market.base}/${market.quote}`.toUpperCase();
    const suffix = this.options.labelSuffix ? ` ${this.options.labelSuffix}` : "";

    return {
      id: `${this.id}:${pair}`,
      datasourceId: this.id,
      exchange: this.label,
      marketType: this.marketType,
      symbol: pair,
      base: market.base?.toUpperCase() ?? "",
      quote: market.quote?.toUpperCase() ?? "",
      displayName: `${pair}${suffix}`,
      priceScale: this.getPriceScale(market),
    };
  }

  private getPriceScale(market: CcxtMarket) {
    const tickSize = this.extractTickSize(market) ?? market.precision?.price ?? market.limits?.price?.min;
    if (typeof tickSize !== "number" || !Number.isFinite(tickSize) || tickSize <= 0) {
      return 100;
    }

    if (tickSize < 1) {
      return this.tickSizeToPriceScale(tickSize);
    }

    if (Number.isInteger(tickSize) && tickSize <= 12) {
      return 10 ** tickSize;
    }

    return 1;
  }

  private extractTickSize(market: CcxtMarket) {
    const info = market.info;
    if (!info || typeof info !== "object") {
      return null;
    }

    const filters = "filters" in info ? (info as { filters?: unknown }).filters : undefined;
    if (Array.isArray(filters)) {
      const priceFilter = filters.find((filter) => (
        filter &&
        typeof filter === "object" &&
        "filterType" in filter &&
        (filter as { filterType?: unknown }).filterType === "PRICE_FILTER"
      ));
      const tickSize = priceFilter && typeof priceFilter === "object"
        ? Number((priceFilter as { tickSize?: unknown }).tickSize)
        : Number.NaN;
      if (Number.isFinite(tickSize) && tickSize > 0) {
        return tickSize;
      }
    }

    const directTickSize =
      "tickSize" in info
        ? Number((info as { tickSize?: unknown }).tickSize)
        : "tickSz" in info
          ? Number((info as { tickSz?: unknown }).tickSz)
          : Number.NaN;
    return Number.isFinite(directTickSize) && directTickSize > 0 ? directTickSize : null;
  }

  private tickSizeToPriceScale(tickSize: number) {
    const normalized = tickSize.toFixed(12).replace(/0+$/, "");
    const decimals = normalized.includes(".") ? normalized.split(".")[1]?.length ?? 0 : 0;
    return Math.min(10 ** decimals, 1_000_000_000_000);
  }

  private normalizeOhlcv(row: unknown[]): Bar {
    return {
      time: this.toNumber(row[0]),
      open: this.toNumber(row[1]),
      high: this.toNumber(row[2]),
      low: this.toNumber(row[3]),
      close: this.toNumber(row[4]),
      volume: this.toNumber(row[5]),
    };
  }

  private toNumber(value: unknown) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  private parseDatasourceSymbol(fullName: string) {
    return fullName.split(":").slice(1).join(":");
  }

  private compactToPair(symbol: string) {
    for (const quote of ["USDT", "USDC", "BTC", "ETH", "USD"]) {
      if (symbol.endsWith(quote) && symbol.length > quote.length) {
        return `${symbol.slice(0, -quote.length)}/${quote}`;
      }
    }
    return symbol;
  }

  private scoreSymbol(item: SymbolDescriptor, normalized: string): number {
    if (!normalized) return this.quotePriority.get(item.quote) ?? 0;
    if (item.symbol === normalized) return 1000;
    if (item.symbol.replace("/", "") === normalized) return 980;
    if (item.base === normalized) return 900;
    if (item.symbol.startsWith(normalized)) return 700;
    if (item.base.startsWith(normalized)) return 650;
    if (item.symbol.includes(normalized)) return 420;
    return 200 + (this.quotePriority.get(item.quote) ?? 0);
  }

  private resolutionToSeconds(resolution: ResolutionString) {
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

  private sleep(ms: number) {
    return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
  }

  private getCacheKey() {
    return `nexa-ccxt-symbol-cache:usdt-only:price-scale-v2:${this.id}`;
  }
}
