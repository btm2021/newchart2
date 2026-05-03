export interface UserWorkspaceState {
  activeDatasourceId: string;
  activeSymbol: string;
  activeInterval: string;
  chartType: "candles" | "line" | "bars";
  theme: "dark";
  keepScreenAwake: boolean;
}

const STORAGE_KEY = "nexa-workspace-v1";

export const defaultWorkspaceState: UserWorkspaceState = {
  activeDatasourceId: "BINANCE_FUTURES",
  activeSymbol: "BINANCE_FUTURES:BTC/USDT",
  activeInterval: "15",
  chartType: "candles",
  theme: "dark",
  keepScreenAwake: true,
};

export function loadWorkspaceState(): UserWorkspaceState {
  if (typeof window === "undefined") return defaultWorkspaceState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWorkspaceState;
    const parsed = JSON.parse(raw) as Partial<UserWorkspaceState>;
    return {
      ...defaultWorkspaceState,
      ...parsed,
    };
  } catch {
    return defaultWorkspaceState;
  }
}

export function saveWorkspaceState(state: UserWorkspaceState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
