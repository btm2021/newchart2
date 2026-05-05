export type PaperSide = "buy" | "sell";
export type PaperPositionSide = "long" | "short";
export type PaperOrderType = "limit";
export type PaperOrderStatus = "pending" | "filled" | "canceled" | "rejected";

export type PaperAccount = {
  id: string;
  name: string;
  currency: string;
  startingBalance: number;
  cashBalance: number;
  realizedPnl: number;
  createdAt: string;
  updatedAt: string;
};

export type PaperPosition = {
  id: string;
  accountId: string;
  datasourceId: string;
  exchange: string;
  symbol: string;
  side: PaperPositionSide;
  quantity: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  margin: number;
  unrealizedPnl: number;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  updatedAt: string;
};

export type PaperOrder = {
  id: string;
  accountId: string;
  datasourceId: string;
  exchange: string;
  symbol: string;
  side: PaperSide;
  type: PaperOrderType;
  status: PaperOrderStatus;
  quantity: number;
  quantityUsd: number;
  price: number;
  leverage: number;
  reduceOnly: boolean;
  notional: number;
  fee: number;
  realizedPnl: number;
  rejectReason: string | null;
  createdAt: string;
  filledAt: string | null;
  updatedAt: string;
};

export type PaperFill = {
  id: string;
  orderId: string;
  accountId: string;
  datasourceId: string;
  exchange: string;
  symbol: string;
  side: PaperSide;
  quantity: number;
  price: number;
  fee: number;
  realizedPnl: number;
  createdAt: string;
};

export type PaperTradingState = {
  account: PaperAccount;
  positions: PaperPosition[];
  orders: PaperOrder[];
  fills: PaperFill[];
  metrics: {
    equity: number;
    available: number;
    marginUsed: number;
    unrealizedPnl: number;
    realizedPnl: number;
    openPositions: number;
    pendingOrders: number;
    lastPrices: Record<string, number>;
  };
};

export type PlacePaperOrderRequest = {
  datasourceId: string;
  exchange: string;
  symbol: string;
  side: PaperSide;
  type?: PaperOrderType;
  quantityUsd: number;
  price: number;
  leverage: number;
};
