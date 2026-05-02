import type { BarsRequest, DatasourceAdapter, MarketType, SymbolDescriptor } from "@/lib/datasources/types";
import type { Bar, LibrarySymbolInfo, ResolutionString, SearchSymbolResultItem } from "@/lib/types/charting";

export abstract class BaseDatasourceAdapter implements DatasourceAdapter {
  abstract readonly supportedResolutions: ResolutionString[];

  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly marketType: MarketType,
  ) {}

  abstract initialize(): Promise<void>;
  abstract getSymbols(): SymbolDescriptor[];
  abstract searchSymbols(query: string): SearchSymbolResultItem[];
  abstract resolveSymbol(fullName: string): Promise<LibrarySymbolInfo>;
  abstract getBars(symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, range: BarsRequest): Promise<{ bars: Bar[]; meta: { noData: boolean } }>;
  abstract subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onRealtimeCallback: (bar: Bar) => void,
    subscriberUID: string,
    onResetCacheNeededCallback?: () => void,
  ): void;
  abstract unsubscribeBars(subscriberUID: string): void;

  canResolveInput(input: string) {
    return this.normalizeInputSymbol(input) !== null;
  }

  normalizeInputSymbol(input: string) {
    const upper = input.trim().toUpperCase();
    if (!upper) return null;

    if (upper.startsWith(`${this.id}:`)) {
      return upper;
    }

    const symbol = this.getSymbols().find((item) => item.symbol === upper || item.symbol.replaceAll("_", "") === upper);
    return symbol?.id ?? null;
  }
}
