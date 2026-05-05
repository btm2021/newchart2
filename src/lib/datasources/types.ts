import type { Bar, LibrarySymbolInfo, ResolutionString, SearchSymbolResultItem } from "@/lib/types/charting";

export type MarketType = "spot" | "futures" | "forex";

export interface SymbolDescriptor {
  id: string;
  datasourceId: string;
  exchange: string;
  marketType: MarketType;
  symbol: string;
  base: string;
  quote: string;
  displayName: string;
  priceScale?: number;
}

export interface BarsRequest {
  from: number;
  to: number;
  firstDataRequest: boolean;
}

export interface DatasourceAdapter {
  id: string;
  label: string;
  marketType: MarketType;
  supportedResolutions: ResolutionString[];
  initialize(): Promise<void>;
  getSymbols(): SymbolDescriptor[];
  canResolveInput(input: string): boolean;
  normalizeInputSymbol(input: string): string | null;
  searchSymbols(query: string): SearchSymbolResultItem[];
  resolveSymbol(fullName: string): Promise<LibrarySymbolInfo>;
  getBars(symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, range: BarsRequest): Promise<{ bars: Bar[]; meta: { noData: boolean } }>;
  subscribeBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    onRealtimeCallback: (bar: Bar) => void,
    subscriberUID: string,
    onResetCacheNeededCallback?: () => void,
  ): void;
  unsubscribeBars(subscriberUID: string): void;
}
