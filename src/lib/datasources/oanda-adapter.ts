import { BaseDatasourceAdapter } from "@/lib/datasources/base-adapter";
import type { BarsRequest, MarketType, SymbolDescriptor } from "@/lib/datasources/types";
import { readSymbolCache, writeSymbolCache } from "@/lib/storage/symbol-cache";
import type { Bar, LibrarySymbolInfo, ResolutionString, SearchSymbolResultItem } from "@/lib/types/charting";

type OandaInstrument = {
  name: string;
  displayName: string;
  type: string;
  pipLocation: number;
  displayPrecision: number;
};

type SubscriberRecord = {
  controller: AbortController;
  closedByClient: boolean;
  lastBar: Bar | null;
};

const RESOLUTION_TO_GRANULARITY: Record<ResolutionString, string> = {
  "1": "M1",
  "5": "M5",
  "15": "M15",
  "30": "M30",
  "60": "H1",
  "240": "H4",
  "1D": "D",
  "1W": "W",
  "1M": "M",
};

const SUPPORTED_RESOLUTIONS: ResolutionString[] = ["1", "5", "15", "30", "60", "240", "1D", "1W", "1M"];

const POPULAR_INSTRUMENTS = new Set([
  "XAU_USD",
  "XAU_EUR",
  "XAU_AUD",
  "XAU_CAD",
  "XAU_CHF",
  "XAU_NZD",
  "XAU_GBP",
  "XAU_JPY",
  "XAG_USD",
  "EUR_USD",
  "GBP_USD",
  "USD_JPY",
  "USD_CHF",
  "AUD_USD",
  "USD_CAD",
  "NZD_USD",
  "EUR_GBP",
  "EUR_JPY",
  "GBP_JPY",
  "EUR_CHF",
  "AUD_JPY",
  "GBP_CHF",
  "EUR_AUD",
  "EUR_CAD",
  "AUD_CAD",
  "AUD_NZD",
  "CAD_JPY",
  "CHF_JPY",
  "NZD_JPY",
  "GBP_CAD",
  "GBP_AUD",
  "GBP_NZD",
  "EUR_NZD",
  "AUD_CHF",
  "NZD_CHF",
  "CAD_CHF",
  "NZD_CAD",
  "WTICO_USD",
  "BCO_USD",
]);

export class OandaAdapter extends BaseDatasourceAdapter {
  public readonly supportedResolutions = SUPPORTED_RESOLUTIONS;
  private initialized = false;
  private instruments: OandaInstrument[] = [];
  private symbolMap = new Map<string, SymbolDescriptor>();
  private priceScaleMap = new Map<string, number>();
  private subscribers = new Map<string, SubscriberRecord>();

  constructor(
    id: string,
    label: string,
    private readonly options: {
      restUrl: string;
      streamUrl: string;
      accountId: string;
      token: string;
    },
  ) {
    super(id, label, "forex");
  }

  override normalizeInputSymbol(input: string) {
    const upper = input.trim().toUpperCase();
    if (!upper) return null;

    if (upper.startsWith(`${this.id}:`)) {
      return upper;
    }

    if (upper.endsWith(".OA") || upper.endsWith(".OANDA")) {
      const normalized = upper.replace(/\.OA$|\.OANDA$/, "");
      return super.normalizeInputSymbol(normalized);
    }

    return super.normalizeInputSymbol(upper);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const cachedSymbols = await readSymbolCache<OandaInstrument>(this.getCacheKey(), 1000 * 60 * 60 * 12);
    if (cachedSymbols.length > 0) {
      this.instruments = cachedSymbols;
      this.hydrateMaps();
      this.initialized = true;
      return;
    }

    try {
      const response = await fetch(`${this.options.restUrl}/accounts/${this.options.accountId}/instruments`, {
        headers: {
          Authorization: `Bearer ${this.options.token}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${this.label} instruments`);
      }

      const payload = (await response.json()) as { instruments: OandaInstrument[] };
      this.instruments = payload.instruments.filter((item) => POPULAR_INSTRUMENTS.has(item.name));
      await writeSymbolCache(this.getCacheKey(), this.instruments);
    } catch (error) {
      const staleSymbols = await readSymbolCache<OandaInstrument>(this.getCacheKey(), 1000 * 60 * 60 * 12, true);
      if (staleSymbols.length === 0) {
        throw error;
      }
      this.instruments = staleSymbols;
    }

    this.hydrateMaps();
    this.initialized = true;
  }

  getSymbols(): SymbolDescriptor[] {
    return [...this.symbolMap.values()];
  }

  searchSymbols(query: string): SearchSymbolResultItem[] {
    const normalized = query.trim().toUpperCase().replace("/", "_");
    return this.getSymbols()
      .filter((item) => {
        if (!normalized) return true;
        return item.symbol.includes(normalized) || item.base.includes(normalized) || item.quote.includes(normalized);
      })
      .slice(0, 80)
      .map((item) => ({
        symbol: item.symbol,
        full_name: item.id,
        description: item.displayName,
        exchange: this.label,
        type: "forex",
      }));
  }

  async resolveSymbol(fullName: string): Promise<LibrarySymbolInfo> {
    await this.initialize();

    const descriptor = this.symbolMap.get(fullName.toUpperCase());
    if (!descriptor) {
      throw new Error(`Unsupported OANDA symbol: ${fullName}`);
    }

    return {
      name: descriptor.symbol,
      full_name: descriptor.id,
      ticker: descriptor.id,
      description: descriptor.displayName,
      type: "forex",
      session: "0000-2400:1234567",
      timezone: "Etc/UTC",
      exchange: this.label,
      listed_exchange: this.label,
      minmov: 1,
      pricescale: this.priceScaleMap.get(descriptor.id) ?? 100000,
      has_intraday: true,
      has_daily: true,
      has_weekly_and_monthly: true,
      supported_resolutions: this.supportedResolutions,
      volume_precision: 0,
      data_status: "streaming",
      has_no_volume: true,
    };
  }

  async getBars(symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, range: BarsRequest): Promise<{ bars: Bar[]; meta: { noData: boolean } }> {
    const granularity = RESOLUTION_TO_GRANULARITY[resolution];
    const instrument = this.parseInstrumentName(symbolInfo);
    const now = Math.floor(Date.now() / 1000);
    const adjustedTo = Math.min(range.to, now - 5);
    if (range.from > adjustedTo) {
      return { bars: [], meta: { noData: true } };
    }

    const search = new URLSearchParams({
      price: "M",
      granularity,
      from: new Date(range.from * 1000).toISOString(),
      to: new Date(adjustedTo * 1000).toISOString(),
    });

    const response = await fetch(`${this.options.restUrl}/instruments/${instrument}/candles?${search.toString()}`, {
      headers: {
        Authorization: `Bearer ${this.options.token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch OANDA bars for ${instrument}`);
    }

    const payload = (await response.json()) as {
      candles?: Array<{
        time: string;
        volume: number;
        complete: boolean;
        mid?: { o: string; h: string; l: string; c: string };
      }>;
    };

    let bars: Bar[] = (payload.candles ?? [])
      .filter((candle) => candle.mid)
      .map((candle) => ({
        time: Date.parse(candle.time),
        open: Number(candle.mid!.o),
        high: Number(candle.mid!.h),
        low: Number(candle.mid!.l),
        close: Number(candle.mid!.c),
        volume: candle.volume,
      }));

    if (bars.length === 0) {
      const fallback = await this.fetchNearestBarsBeforeGap(instrument, granularity, range.from);
      bars = fallback;
    }

    if (["1D", "1W", "1M"].includes(resolution)) {
      bars = this.fillGaps(bars);
    }

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
    const instrument = this.parseInstrumentName(symbolInfo);
    const url = `${this.options.streamUrl}/accounts/${this.options.accountId}/pricing/stream?instruments=${encodeURIComponent(instrument)}&snapshot=false`;
    const controller = new AbortController();
    const record: SubscriberRecord = {
      controller,
      closedByClient: false,
      lastBar: null,
    };
    this.subscribers.set(subscriberUID, record);

    const connect = async () => {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${this.options.token}`,
          },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`Failed to open OANDA stream for ${instrument}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const payload = JSON.parse(trimmed) as {
              type?: string;
              time?: string;
              bids?: Array<{ price: string }>;
              asks?: Array<{ price: string }>;
            };
            if (payload.type === "HEARTBEAT" || !payload.time || !payload.bids?.[0]?.price || !payload.asks?.[0]?.price) {
              continue;
            }

            const price = (Number(payload.bids[0].price) + Number(payload.asks[0].price)) / 2;
            const barTime = this.floorToResolution(Date.parse(payload.time), resolution);
            const current = this.subscribers.get(subscriberUID);
            if (!current) return;

            if (!current.lastBar || current.lastBar.time !== barTime) {
              current.lastBar = {
                time: barTime,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 0,
              };
            } else {
              current.lastBar = {
                ...current.lastBar,
                high: Math.max(current.lastBar.high, price),
                low: Math.min(current.lastBar.low, price),
                close: price,
              };
            }

            onRealtimeCallback(current.lastBar);
          }
        }
      } catch (error) {
        const current = this.subscribers.get(subscriberUID);
        if (!current || current.closedByClient || controller.signal.aborted) {
          return;
        }
        onResetCacheNeededCallback?.();
        window.setTimeout(connect, 1500);
      }
    };

    void connect();
  }

  unsubscribeBars(subscriberUID: string): void {
    const subscriber = this.subscribers.get(subscriberUID);
    if (!subscriber) return;
    subscriber.closedByClient = true;
    subscriber.controller.abort();
    this.subscribers.delete(subscriberUID);
  }

  private hydrateMaps() {
    this.symbolMap.clear();
    this.priceScaleMap.clear();

    for (const instrument of this.instruments) {
      const descriptor = this.toDescriptor(instrument);
      this.symbolMap.set(descriptor.id, descriptor);
      this.priceScaleMap.set(descriptor.id, 10 ** instrument.displayPrecision);
    }
  }

  private toDescriptor(instrument: OandaInstrument): SymbolDescriptor {
    const [base, quote] = instrument.name.split("_");
    const displayName = this.getDisplayName(instrument.name, base, quote);

    return {
      id: `${this.id}:${instrument.name}`.toUpperCase(),
      datasourceId: this.id,
      exchange: this.label,
      marketType: this.marketType,
      symbol: instrument.name,
      base,
      quote,
      displayName,
    };
  }

  private getDisplayName(name: string, base: string, quote: string) {
    if (name === "XAU_USD") return "Gold / US Dollar";
    if (name === "XAU_EUR") return "Gold / Euro";
    if (name === "XAU_AUD") return "Gold / Australian Dollar";
    if (name === "XAU_CAD") return "Gold / Canadian Dollar";
    if (name === "XAU_CHF") return "Gold / Swiss Franc";
    if (name === "XAU_NZD") return "Gold / New Zealand Dollar";
    if (name === "XAU_GBP") return "Gold / British Pound";
    if (name === "XAU_JPY") return "Gold / Japanese Yen";
    if (name === "XAG_USD") return "Silver / US Dollar";
    if (name === "WTICO_USD") return "WTI Crude Oil / US Dollar";
    if (name === "BCO_USD") return "Brent Crude Oil / US Dollar";
    return `${base}/${quote}`;
  }

  private parseInstrumentName(symbolInfo: LibrarySymbolInfo) {
    return symbolInfo.full_name.split(":")[1] ?? symbolInfo.name;
  }

  private floorToResolution(timestampMs: number, resolution: ResolutionString) {
    const sizeMs = this.resolutionToMs(resolution);
    return Math.floor(timestampMs / sizeMs) * sizeMs;
  }

  private resolutionToMs(resolution: ResolutionString) {
    switch (resolution) {
      case "1":
        return 60_000;
      case "5":
        return 300_000;
      case "15":
        return 900_000;
      case "30":
        return 1_800_000;
      case "60":
        return 3_600_000;
      case "240":
        return 14_400_000;
      case "1D":
        return 86_400_000;
      case "1W":
        return 604_800_000;
      case "1M":
        return 2_592_000_000;
    }
  }

  private async fetchNearestBarsBeforeGap(instrument: string, granularity: string, fromSec: number) {
    const search = new URLSearchParams({
      price: "M",
      granularity,
      to: new Date(fromSec * 1000).toISOString(),
      count: "50",
    });

    const response = await fetch(`${this.options.restUrl}/instruments/${instrument}/candles?${search.toString()}`, {
      headers: {
        Authorization: `Bearer ${this.options.token}`,
      },
    });
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      candles?: Array<{
        time: string;
        volume: number;
        mid?: { o: string; h: string; l: string; c: string };
      }>;
    };

    return (payload.candles ?? [])
      .filter((candle) => candle.mid)
      .map((candle) => ({
        time: Date.parse(candle.time),
        open: Number(candle.mid!.o),
        high: Number(candle.mid!.h),
        low: Number(candle.mid!.l),
        close: Number(candle.mid!.c),
        volume: candle.volume,
      }));
  }

  private isWeekend(timestamp: number) {
    const day = new Date(timestamp).getUTCDay();
    return day === 0 || day === 6;
  }

  private fillGaps(bars: Bar[]) {
    if (bars.length === 0) return bars;

    const filledBars: Bar[] = [];
    const barInterval = bars.length > 1 ? bars[1].time - bars[0].time : 86_400_000;

    for (let index = 0; index < bars.length; index += 1) {
      filledBars.push(bars[index]);

      if (index >= bars.length - 1) continue;

      const currentBar = bars[index];
      const nextBar = bars[index + 1];
      const gap = nextBar.time - currentBar.time;
      if (gap <= barInterval * 2) continue;

      let fillTime = currentBar.time + barInterval;
      while (fillTime < nextBar.time) {
        if (!this.isWeekend(fillTime)) {
          filledBars.push({
            time: fillTime,
            open: currentBar.close,
            high: currentBar.close,
            low: currentBar.close,
            close: currentBar.close,
            volume: 0,
          });
        }
        fillTime += barInterval;
      }
    }

    return filledBars;
  }

  private getCacheKey() {
    return `nexa-symbol-cache:${this.id}`;
  }
}
