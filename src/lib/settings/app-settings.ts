export type AppSettings = {
  theme: "dark" | "light" | "system";
  defaultDashboardRange: "24h" | "7d" | "30d";
  defaultChartSource: "BINANCE_SPOT" | "BINANCE_FUTURES" | "OKX_PERP";
  defaultChartSymbol: string;
  defaultInterval: "1" | "5" | "15" | "30" | "60" | "240" | "1D";
  monitorBatchSize: number;
  monitorRefreshSeconds: number;
  monitorExpireMinutes: number;
  smartRefreshDivisor: number;
  accountRefreshSeconds: number;
  riskMaxMarginUsage: number;
  riskMaxPositionLeverage: number;
  notificationsEnabled: boolean;
  notifyOnHighRisk: boolean;
  notifyOnApiError: boolean;
  paperMode: boolean;
};

export type ExchangeEnvStatus = {
  id: "BINANCE" | "OKX" | "BYBIT";
  label: string;
  configured: boolean;
  requiredEnv: Array<{
    name: string;
    configured: boolean;
  }>;
};

export const defaultAppSettings: AppSettings = {
  theme: "dark",
  defaultDashboardRange: "24h",
  defaultChartSource: "BINANCE_FUTURES",
  defaultChartSymbol: "BTC/USDT",
  defaultInterval: "15",
  monitorBatchSize: 30,
  monitorRefreshSeconds: 60,
  monitorExpireMinutes: 15,
  smartRefreshDivisor: 30,
  accountRefreshSeconds: 30,
  riskMaxMarginUsage: 60,
  riskMaxPositionLeverage: 10,
  notificationsEnabled: true,
  notifyOnHighRisk: true,
  notifyOnApiError: true,
  paperMode: true,
};

export function normalizeAppSettings(value: unknown): AppSettings {
  const source = typeof value === "object" && value !== null ? value as Partial<AppSettings> : {};

  return {
    ...defaultAppSettings,
    ...source,
    defaultChartSymbol: source.defaultChartSymbol?.trim().toUpperCase() || defaultAppSettings.defaultChartSymbol,
    monitorBatchSize: clampNumber(source.monitorBatchSize, 1, 200, defaultAppSettings.monitorBatchSize),
    monitorRefreshSeconds: clampNumber(source.monitorRefreshSeconds, 15, 900, defaultAppSettings.monitorRefreshSeconds),
    monitorExpireMinutes: clampNumber(source.monitorExpireMinutes, 1, 240, defaultAppSettings.monitorExpireMinutes),
    smartRefreshDivisor: clampNumber(source.smartRefreshDivisor, 1, 200, defaultAppSettings.smartRefreshDivisor),
    accountRefreshSeconds: clampNumber(source.accountRefreshSeconds, 5, 600, defaultAppSettings.accountRefreshSeconds),
    riskMaxMarginUsage: clampNumber(source.riskMaxMarginUsage, 1, 100, defaultAppSettings.riskMaxMarginUsage),
    riskMaxPositionLeverage: clampNumber(source.riskMaxPositionLeverage, 1, 125, defaultAppSettings.riskMaxPositionLeverage),
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.round(number), min), max);
}
