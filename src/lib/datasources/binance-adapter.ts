import { BaseDatasourceAdapter } from "@/lib/datasources/base-adapter";
import type { BarsRequest, MarketType, SymbolDescriptor } from "@/lib/datasources/types";
import { readSymbolCache, writeSymbolCache } from "@/lib/storage/symbol-cache";
import type { Bar, LibrarySymbolInfo, ResolutionString, SearchSymbolResultItem } from "@/lib/types/charting";

type BinanceExchangeSymbol = {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters?: Array<{ filterType: string; tickSize?: string }>;
  pricePrecision?: number;
};

const RESOLUTION_TO_INTERVAL: Record<ResolutionString, string> = {
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

type SubscriberRecord = {
  socket: WebSocket;
  closedByClient: boolean;
};

const SUPPORTED_RESOLUTIONS: ResolutionString[] = ["1", "5", "15", "30", "60", "240", "1D", "1W", "1M"];

export class BinanceAdapter extends BaseDatasourceAdapter {
  public readonly supportedResolutions = SUPPORTED_RESOLUTIONS;

  private readonly baseUrl: string;
  private readonly wsBaseUrl: string;
  private readonly quotePriority = new Map([
    ["USDT", 3],
    ["USDC", 2],
    ["BTC", 1],
  ]);
  private readonly blacklistPatterns: RegExp[];
  private initialized = false;
  private exchangeSymbols: BinanceExchangeSymbol[] = [];
  private symbolMap = new Map<string, SymbolDescriptor>();
  private priceScaleMap = new Map<string, number>();
  private subscribers = new Map<string, SubscriberRecord>();

  constructor(
    id: string,
    label: string,
    marketType: MarketType,
    options: {
      baseUrl: string;
      wsBaseUrl: string;
      blacklistPatterns?: RegExp[];
    },
  ) {
    super(id, label, marketType);
    this.baseUrl = options.baseUrl;
    this.wsBaseUrl = options.wsBaseUrl;
    this.blacklistPatterns = options.blacklistPatterns ?? [];
  }

  override normalizeInputSymbol(input: string) {
    const upper = input.trim().toUpperCase();
    if (!upper) return null;

    if (upper.startsWith(`${this.id}:`)) {
      return upper;
    }

    if (this.id === "BINANCE_FUTURES" && upper.endsWith(".P")) {
      return `${this.id}:${upper.slice(0, -2)}`;
    }
    if (this.id === "BINANCE_SPOT" && upper.endsWith(".S")) {
      return `${this.id}:${upper.slice(0, -2)}`;
    }

    return super.normalizeInputSymbol(upper);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const cachedSymbols = (await readSymbolCache<BinanceExchangeSymbol>(this.getCacheKey(), 1000 * 60 * 60 * 12)).filter((entry) => this.isTradable(entry));
    if (cachedSymbols.length > 0) {
      this.exchangeSymbols = cachedSymbols;
      this.hydrateMaps();
      this.initialized = true;
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/exchangeInfo`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${this.label} exchange info`);
      }

      const payload = (await response.json()) as { symbols: BinanceExchangeSymbol[] };
      this.exchangeSymbols = payload.symbols.filter((entry) => this.isTradable(entry));
      await writeSymbolCache(this.getCacheKey(), this.exchangeSymbols);
    } catch (error) {
      const staleSymbols = (await readSymbolCache<BinanceExchangeSymbol>(this.getCacheKey(), 1000 * 60 * 60 * 12, true)).filter((entry) => this.isTradable(entry));
      if (staleSymbols.length === 0) {
        throw error;
      }
      this.exchangeSymbols = staleSymbols;
    }

    this.hydrateMaps();
    this.initialized = true;
  }

  private hydrateMaps() {
    this.symbolMap.clear();
    this.priceScaleMap.clear();

    for (const entry of this.exchangeSymbols) {
      const descriptor = this.toDescriptor(entry);
      this.symbolMap.set(descriptor.id, descriptor);
      this.priceScaleMap.set(descriptor.id, this.getPriceScale(entry));
    }
  }

  getSymbols(): SymbolDescriptor[] {
    return [...this.symbolMap.values()];
  }

  searchSymbols(query: string): SearchSymbolResultItem[] {
    const normalized = query.trim().toUpperCase();
    const allSymbols = this.getSymbols();
    const scored = allSymbols
      .filter((item) => {
        if (!normalized) return true;
        return item.symbol.includes(normalized) || item.base.includes(normalized) || item.quote.includes(normalized);
      })
      .map((item) => ({
        item,
        score: this.scoreSymbol(item, normalized),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 80);

    return scored.map(({ item }) => ({
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
      data_status: "streaming",
    };
  }

  async getBars(symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, range: BarsRequest): Promise<{ bars: Bar[]; meta: { noData: boolean } }> {
    const interval = RESOLUTION_TO_INTERVAL[resolution];
    const symbol = this.parseSymbolName(symbolInfo);
    const search = new URLSearchParams({
      symbol,
      interval,
      startTime: String(range.from * 1000),
      endTime: String(range.to * 1000),
      limit: "1000",
    });

    const response = await fetch(`${this.baseUrl}/klines?${search.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch historical bars for ${symbol}`);
    }

    const data = (await response.json()) as Array<[number, string, string, string, string, string]>;
    if (!Array.isArray(data) || data.length === 0) {
      return { bars: [], meta: { noData: true } };
    }

    const bars = data.map((item) => ({
      time: item[0],
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
    }));

    return {
      bars,
      meta: { noData: false },
    };
  }

  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onRealtimeCallback: (bar: Bar) => void,
    subscriberUID: string,
    onResetCacheNeededCallback?: () => void,
  ): void {
    const symbol = this.parseSymbolName(symbolInfo).toLowerCase();
    const interval = RESOLUTION_TO_INTERVAL[resolution];

    const connect = () => {
      const socket = new WebSocket(`${this.wsBaseUrl}/${symbol}@kline_${interval}`);
      const record: SubscriberRecord = { socket, closedByClient: false };
      this.subscribers.set(subscriberUID, record);

      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as {
          k?: { t: number; o: string; h: string; l: string; c: string; v: string };
        };

        if (!payload.k) return;

        onRealtimeCallback({
          time: payload.k.t,
          open: Number(payload.k.o),
          high: Number(payload.k.h),
          low: Number(payload.k.l),
          close: Number(payload.k.c),
          volume: Number(payload.k.v),
        });
      };

      socket.onerror = () => {
        onResetCacheNeededCallback?.();
      };

      socket.onclose = () => {
        const current = this.subscribers.get(subscriberUID);
        if (!current || current.closedByClient) {
          this.subscribers.delete(subscriberUID);
          return;
        }

        window.setTimeout(connect, 1200);
      };
    };

    connect();
  }

  unsubscribeBars(subscriberUID: string): void {
    const subscriber = this.subscribers.get(subscriberUID);
    if (!subscriber) return;
    subscriber.closedByClient = true;
    subscriber.socket.close();
    this.subscribers.delete(subscriberUID);
  }

  private isTradable(entry: BinanceExchangeSymbol): boolean {
    if (entry.status !== "TRADING") return false;
    return !this.blacklistPatterns.some((pattern) => pattern.test(entry.symbol));
  }

  private toDescriptor(entry: BinanceExchangeSymbol): SymbolDescriptor {
    return {
      id: `${this.id}:${entry.symbol}`.toUpperCase(),
      datasourceId: this.id,
      exchange: this.label,
      marketType: this.marketType,
      symbol: entry.symbol,
      base: entry.baseAsset,
      quote: entry.quoteAsset,
      displayName: `${entry.baseAsset}/${entry.quoteAsset} ${this.marketType === "futures" ? "Perpetual" : "Spot"}`,
    };
  }

  private getPriceScale(entry: BinanceExchangeSymbol): number {
    const tickSize = entry.filters?.find((filter) => filter.filterType === "PRICE_FILTER")?.tickSize;
    if (tickSize) {
      const decimals = this.countDecimals(tickSize);
      return 10 ** decimals;
    }

    if (typeof entry.pricePrecision === "number") {
      return 10 ** entry.pricePrecision;
    }

    return 100;
  }

  private countDecimals(value: string): number {
    if (!value.includes(".")) return 0;
    return value.replace(/0+$/, "").split(".")[1]?.length ?? 0;
  }

  private scoreSymbol(item: SymbolDescriptor, normalized: string): number {
    if (!normalized) return this.quotePriority.get(item.quote) ?? 0;
    if (item.symbol === normalized) return 1000;
    if (item.base === normalized) return 900;
    if (item.symbol.startsWith(normalized)) return 700;
    if (item.base.startsWith(normalized)) return 650;
    if (item.symbol.includes(normalized)) return 420;
    return 200 + (this.quotePriority.get(item.quote) ?? 0);
  }

  private parseSymbolName(symbolInfo: LibrarySymbolInfo): string {
    return symbolInfo.full_name.split(":")[1] ?? symbolInfo.name;
  }

  private getCacheKey() {
    return `nexa-symbol-cache:${this.id}`;
  }
}
