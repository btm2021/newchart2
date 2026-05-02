export type ResolutionString = "1" | "5" | "15" | "30" | "60" | "240" | "1D" | "1W" | "1M";

export interface LibrarySymbolInfo {
  name: string;
  full_name: string;
  ticker: string;
  description: string;
  type: string;
  session: string;
  timezone: string;
  exchange: string;
  listed_exchange?: string;
  minmov: number;
  pricescale: number;
  has_intraday: boolean;
  has_daily: boolean;
  has_weekly_and_monthly: boolean;
  supported_resolutions: string[];
  volume_precision?: number;
  data_status?: string;
  logo_urls?: string[];
  has_no_volume?: boolean;
}

export interface SearchSymbolResultItem {
  symbol: string;
  full_name: string;
  description: string;
  exchange: string;
  type: string;
  logo_urls?: string[];
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface HistoryMetadata {
  noData?: boolean;
  nextTime?: number;
}

export interface ChartingLibraryWidget {
  onChartReady(cb: () => void): void;
  headerReady(): Promise<void>;
  createButton(options?: { align?: "left" | "right" }): HTMLButtonElement;
  activeChart(): {
    setSymbol(symbol: string, interval?: string, callback?: () => void): void;
    symbol(): string;
    resolution(): string;
    setResolution(resolution: string, callback?: () => void): void;
    setChartType(chartType: number): void;
    executeActionById(actionId: string): void;
    resetData(): void;
    onSymbolChanged(): {
      subscribe(context: null, handler: (symbol: { name: string; full_name?: string; ticker?: string }) => void): void;
    };
    onIntervalChanged(): {
      subscribe(context: null, handler: (interval: string) => void): void;
    };
  };
  remove(): void;
}

export interface TradingViewWidgetConstructor {
  new (options: Record<string, unknown>): ChartingLibraryWidget;
}

declare global {
  interface Window {
    TradingView?: {
      widget: TradingViewWidgetConstructor;
    };
    __tvWidget?: ChartingLibraryWidget;
    createATRBot?: (pineJs: unknown) => unknown;
    createATRBotVP?: (pineJs: unknown) => unknown;
    createVSR?: (pineJs: unknown) => unknown;
    createVSROriginal?: (pineJs: unknown) => unknown;
    createSessionVP?: (pineJs: unknown) => unknown;
    createSwingPoints?: (pineJs: unknown) => unknown;
    createVIDYA?: (pineJs: unknown) => unknown;
    createKAMA?: (pineJs: unknown) => unknown;
    createSMC?: (pineJs: unknown) => unknown;
    createFVG?: (pineJs: unknown) => unknown;
  }
}
