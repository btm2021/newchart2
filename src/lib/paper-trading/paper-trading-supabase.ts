import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDatasourceRegistry } from "@/lib/datasources/registry";
import type {
  PaperAccount,
  PaperFill,
  PaperOrder,
  PaperPosition,
  PaperPositionSide,
  PaperTradingState,
  PlacePaperOrderRequest,
} from "@/lib/paper-trading/paper-trading-types";

const ACCOUNT_ID = "default";
const TAKER_FEE_RATE = 0.0004;
const DEFAULT_RESOLUTION = "1";

type AccountRow = {
  id: string;
  name: string;
  currency: string;
  starting_balance: number | string;
  cash_balance: number | string;
  realized_pnl: number | string;
  created_at: string;
  updated_at: string;
};

type PositionRow = {
  id: string;
  account_id: string;
  datasource_id: string;
  exchange: string;
  symbol: string;
  side: PaperPositionSide;
  quantity: number | string;
  entry_price: number | string;
  mark_price: number | string;
  leverage: number | string;
  margin: number | string;
  unrealized_pnl: number | string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
};

type OrderRow = {
  id: string;
  account_id: string;
  datasource_id: string;
  exchange: string;
  symbol: string;
  side: "buy" | "sell";
  type: "limit";
  status: "pending" | "filled" | "canceled" | "rejected";
  quantity: number | string;
  price: number | string;
  leverage: number | string;
  reduce_only: boolean;
  notional: number | string;
  fee: number | string;
  realized_pnl: number | string;
  reject_reason: string | null;
  created_at: string;
  filled_at: string | null;
  updated_at: string;
};

type FillRow = {
  id: string;
  order_id: string;
  account_id: string;
  datasource_id: string;
  exchange: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number | string;
  price: number | string;
  fee: number | string;
  realized_pnl: number | string;
  created_at: string;
};

let supabase: SupabaseClient | null = null;

function getSupabase() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }

  supabase = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase;
}

function toNumber(value: number | string | null | undefined) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function mapAccount(row: AccountRow): PaperAccount {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    startingBalance: toNumber(row.starting_balance),
    cashBalance: toNumber(row.cash_balance),
    realizedPnl: toNumber(row.realized_pnl),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPosition(row: PositionRow): PaperPosition {
  return {
    id: row.id,
    accountId: row.account_id,
    datasourceId: row.datasource_id,
    exchange: row.exchange,
    symbol: row.symbol,
    side: row.side,
    quantity: toNumber(row.quantity),
    entryPrice: toNumber(row.entry_price),
    markPrice: toNumber(row.mark_price),
    leverage: toNumber(row.leverage),
    margin: toNumber(row.margin),
    unrealizedPnl: toNumber(row.unrealized_pnl),
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    updatedAt: row.updated_at,
  };
}

function mapOrder(row: OrderRow): PaperOrder {
  return {
    id: row.id,
    accountId: row.account_id,
    datasourceId: row.datasource_id,
    exchange: row.exchange,
    symbol: row.symbol,
    side: row.side,
    type: row.type,
    status: row.status,
  quantity: toNumber(row.quantity),
    quantityUsd: toNumber(row.notional) / Math.max(toNumber(row.leverage), 1),
    price: toNumber(row.price),
    leverage: toNumber(row.leverage),
    reduceOnly: row.reduce_only,
    notional: toNumber(row.notional),
    fee: toNumber(row.fee),
    realizedPnl: toNumber(row.realized_pnl),
    rejectReason: row.reject_reason,
    createdAt: row.created_at,
    filledAt: row.filled_at,
    updatedAt: row.updated_at,
  };
}

function mapFill(row: FillRow): PaperFill {
  return {
    id: row.id,
    orderId: row.order_id,
    accountId: row.account_id,
    datasourceId: row.datasource_id,
    exchange: row.exchange,
    symbol: row.symbol,
    side: row.side,
    quantity: toNumber(row.quantity),
    price: toNumber(row.price),
    fee: toNumber(row.fee),
    realizedPnl: toNumber(row.realized_pnl),
    createdAt: row.created_at,
  };
}

function calculateUnrealized(side: PaperPositionSide, quantity: number, entryPrice: number, markPrice: number) {
  return side === "long"
    ? (markPrice - entryPrice) * quantity
    : (entryPrice - markPrice) * quantity;
}

function calculateMargin(quantity: number, price: number, leverage: number) {
  return (quantity * price) / Math.max(leverage, 1);
}

function oppositePositionSide(side: "buy" | "sell"): PaperPositionSide {
  return side === "buy" ? "short" : "long";
}

function targetPositionSide(side: "buy" | "sell"): PaperPositionSide {
  return side === "buy" ? "long" : "short";
}

function realizedPnlForClose(position: PaperPosition, quantity: number, price: number) {
  return position.side === "long"
    ? (price - position.entryPrice) * quantity
    : (position.entryPrice - price) * quantity;
}

function validateOrder(input: PlacePaperOrderRequest) {
  const normalized = {
    ...input,
    datasourceId: input.datasourceId.trim().toUpperCase(),
    exchange: input.exchange.trim(),
    symbol: input.symbol.trim().toUpperCase(),
    type: "limit" as const,
    quantityUsd: Number(input.quantityUsd),
    price: Number(input.price),
    leverage: Math.min(Math.max(Number(input.leverage) || 20, 1), 125),
  };

  if (!normalized.datasourceId || !normalized.exchange || !normalized.symbol) {
    throw new Error("Datasource, exchange and symbol are required.");
  }
  if (!["buy", "sell"].includes(normalized.side)) {
    throw new Error("Side must be buy or sell.");
  }
  if (!Number.isFinite(normalized.quantityUsd) || normalized.quantityUsd <= 0) {
    throw new Error("Margin USDT must be greater than 0.");
  }
  if (!Number.isFinite(normalized.price) || normalized.price <= 0) {
    throw new Error("Limit price must be greater than 0.");
  }

  return normalized;
}

async function ensureAccount() {
  const client = getSupabase();
  const { data, error } = await client
    .from("paper_accounts")
    .select("*")
    .eq("id", ACCOUNT_ID)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return mapAccount(data as AccountRow);

  const { data: inserted, error: insertError } = await client
    .from("paper_accounts")
    .insert({ id: ACCOUNT_ID, name: "Paper Account", currency: "USDT", starting_balance: 100000, cash_balance: 100000 })
    .select("*")
    .single();

  if (insertError) throw new Error(insertError.message);
  return mapAccount(inserted as AccountRow);
}

async function readOpenPositions() {
  const { data, error } = await getSupabase()
    .from("paper_positions")
    .select("*")
    .eq("account_id", ACCOUNT_ID)
    .eq("status", "open")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as PositionRow[]).map(mapPosition);
}

async function getLatestClose(datasourceId: string, symbol: string, fallbackPrice: number) {
  try {
    const registry = getDatasourceRegistry();
    await registry.initialize();
    const adapter = registry.getAdapter(datasourceId);
    if (!adapter) return fallbackPrice;

    const fullName = `${datasourceId}:${symbol}`;
    const symbolInfo = await adapter.resolveSymbol(fullName);
    const to = Math.floor(Date.now() / 1000);
    const response = await adapter.getBars(symbolInfo, DEFAULT_RESOLUTION, {
      from: to - 15 * 60,
      to,
      firstDataRequest: false,
    });
    return response.bars.at(-1)?.close || fallbackPrice;
  } catch {
    return fallbackPrice;
  }
}

function shouldFillLimitOrder(order: PaperOrder, markPrice: number) {
  return order.side === "buy" ? markPrice <= order.price : markPrice >= order.price;
}

async function fillLimitOrder(order: PaperOrder, fillPrice: number) {
  const client = getSupabase();
  const account = await ensureAccount();
  const openPositions = await readOpenPositions();
  const sameMarketPositions = openPositions.filter((position) => (
    position.datasourceId === order.datasourceId && position.symbol === order.symbol
  ));
  const oppositePosition = sameMarketPositions.find((position) => position.side === oppositePositionSide(order.side));
  const targetPosition = sameMarketPositions.find((position) => position.side === targetPositionSide(order.side));
  let remainingQuantity = order.quantity;
  let realizedPnl = 0;

  if (oppositePosition && remainingQuantity > 0) {
    const closeQuantity = Math.min(oppositePosition.quantity, remainingQuantity);
    realizedPnl += realizedPnlForClose(oppositePosition, closeQuantity, fillPrice);
    remainingQuantity -= closeQuantity;
    const nextQuantity = oppositePosition.quantity - closeQuantity;

    if (nextQuantity <= 0.00000001) {
      const { error } = await client
        .from("paper_positions")
        .update({
          quantity: 0,
          mark_price: fillPrice,
          margin: 0,
          unrealized_pnl: 0,
          status: "closed",
          closed_at: new Date().toISOString(),
        })
        .eq("id", oppositePosition.id);
      if (error) throw new Error(error.message);
    } else {
      const nextMargin = calculateMargin(nextQuantity, oppositePosition.entryPrice, oppositePosition.leverage);
      const nextUnrealized = calculateUnrealized(oppositePosition.side, nextQuantity, oppositePosition.entryPrice, fillPrice);
      const { error } = await client
        .from("paper_positions")
        .update({
          quantity: nextQuantity,
          mark_price: fillPrice,
          margin: nextMargin,
          unrealized_pnl: nextUnrealized,
        })
        .eq("id", oppositePosition.id);
      if (error) throw new Error(error.message);
    }
  }

  if (remainingQuantity > 0) {
    const positionSide = targetPositionSide(order.side);
    if (targetPosition) {
      const nextQuantity = targetPosition.quantity + remainingQuantity;
      const nextEntry = ((targetPosition.entryPrice * targetPosition.quantity) + (fillPrice * remainingQuantity)) / nextQuantity;
      const nextMargin = calculateMargin(nextQuantity, nextEntry, order.leverage);
      const nextUnrealized = calculateUnrealized(positionSide, nextQuantity, nextEntry, fillPrice);
      const { error } = await client
        .from("paper_positions")
        .update({
          quantity: nextQuantity,
          entry_price: nextEntry,
          mark_price: fillPrice,
          leverage: order.leverage,
          margin: nextMargin,
          unrealized_pnl: nextUnrealized,
        })
        .eq("id", targetPosition.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client.from("paper_positions").insert({
        account_id: ACCOUNT_ID,
        datasource_id: order.datasourceId,
        exchange: order.exchange,
        symbol: order.symbol,
        side: positionSide,
        quantity: remainingQuantity,
        entry_price: fillPrice,
        mark_price: fillPrice,
        leverage: order.leverage,
        margin: calculateMargin(remainingQuantity, fillPrice, order.leverage),
        unrealized_pnl: 0,
        status: "open",
      });
      if (error) throw new Error(error.message);
    }
  }

  const notional = order.quantity * fillPrice;
  const fee = notional * TAKER_FEE_RATE;
  const realizedAfterFee = realizedPnl - fee;
  const filledAt = new Date().toISOString();

  const { error: orderError } = await client
    .from("paper_orders")
    .update({
      status: "filled",
      price: fillPrice,
      notional,
      fee,
      realized_pnl: realizedAfterFee,
      filled_at: filledAt,
    })
    .eq("id", order.id)
    .eq("status", "pending");
  if (orderError) throw new Error(orderError.message);

  const { error: fillError } = await client.from("paper_fills").insert({
    order_id: order.id,
    account_id: ACCOUNT_ID,
    datasource_id: order.datasourceId,
    exchange: order.exchange,
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    price: fillPrice,
    fee,
    realized_pnl: realizedAfterFee,
  });
  if (fillError) throw new Error(fillError.message);

  const { error: accountError } = await client
    .from("paper_accounts")
    .update({
      cash_balance: account.cashBalance + realizedAfterFee,
      realized_pnl: account.realizedPnl + realizedAfterFee,
    })
    .eq("id", ACCOUNT_ID);
  if (accountError) throw new Error(accountError.message);
}

async function syncPaperMarketPrices() {
  const client = getSupabase();
  const [positions, pendingOrders] = await Promise.all([
    readOpenPositions(),
    client
      .from("paper_orders")
      .select("*")
      .eq("account_id", ACCOUNT_ID)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
  ]);

  if (pendingOrders.error) throw new Error(pendingOrders.error.message);

  const lastPrices = new Map<string, number>();
  const marketKeys = new Map<string, { datasourceId: string; symbol: string; fallback: number }>();

  positions.forEach((position) => {
    marketKeys.set(`${position.datasourceId}:${position.symbol}`, {
      datasourceId: position.datasourceId,
      symbol: position.symbol,
      fallback: position.markPrice || position.entryPrice,
    });
  });
  ((pendingOrders.data ?? []) as OrderRow[]).forEach((row) => {
    const order = mapOrder(row);
    marketKeys.set(`${order.datasourceId}:${order.symbol}`, {
      datasourceId: order.datasourceId,
      symbol: order.symbol,
      fallback: order.price,
    });
  });

  for (const [key, market] of marketKeys.entries()) {
    lastPrices.set(key, await getLatestClose(market.datasourceId, market.symbol, market.fallback));
  }

  for (const position of positions) {
    const markPrice = lastPrices.get(`${position.datasourceId}:${position.symbol}`) ?? position.markPrice;
    const unrealizedPnl = calculateUnrealized(position.side, position.quantity, position.entryPrice, markPrice);
    const { error } = await client
      .from("paper_positions")
      .update({ mark_price: markPrice, unrealized_pnl: unrealizedPnl })
      .eq("id", position.id);
    if (error) throw new Error(error.message);
  }

  for (const row of (pendingOrders.data ?? []) as OrderRow[]) {
    const order = mapOrder(row);
    const markPrice = lastPrices.get(`${order.datasourceId}:${order.symbol}`) ?? order.price;
    if (shouldFillLimitOrder(order, markPrice)) {
      await fillLimitOrder(order, order.price);
    }
  }
}

export async function readPaperTradingState(): Promise<PaperTradingState> {
  await syncPaperMarketPrices();
  const client = getSupabase();
  const account = await ensureAccount();
  const [{ data: positions, error: positionsError }, { data: orders, error: ordersError }, { data: fills, error: fillsError }] = await Promise.all([
    client.from("paper_positions").select("*").eq("account_id", ACCOUNT_ID).eq("status", "open").order("updated_at", { ascending: false }),
    client.from("paper_orders").select("*").eq("account_id", ACCOUNT_ID).order("created_at", { ascending: false }).limit(50),
    client.from("paper_fills").select("*").eq("account_id", ACCOUNT_ID).order("created_at", { ascending: false }).limit(50),
  ]);

  if (positionsError) throw new Error(positionsError.message);
  if (ordersError) throw new Error(ordersError.message);
  if (fillsError) throw new Error(fillsError.message);

  const mappedPositions = ((positions ?? []) as PositionRow[]).map(mapPosition);
  const mappedOrders = ((orders ?? []) as OrderRow[]).map(mapOrder);
  const mappedFills = ((fills ?? []) as FillRow[]).map(mapFill);
  const marginUsed = mappedPositions.reduce((sum, position) => sum + position.margin, 0);
  const unrealizedPnl = mappedPositions.reduce((sum, position) => sum + position.unrealizedPnl, 0);
  const equity = account.cashBalance + unrealizedPnl;
  const lastPrices = Object.fromEntries(
    mappedPositions.map((position) => [`${position.datasourceId}:${position.symbol}`, position.markPrice]),
  );

  return {
    account,
    positions: mappedPositions,
    orders: mappedOrders,
    fills: mappedFills,
    metrics: {
      equity,
      available: equity - marginUsed,
      marginUsed,
      unrealizedPnl,
      realizedPnl: account.realizedPnl,
      openPositions: mappedPositions.length,
      pendingOrders: mappedOrders.filter((order) => order.status === "pending").length,
      lastPrices,
    },
  };
}

export async function placePaperOrder(input: PlacePaperOrderRequest) {
  const order = validateOrder(input);
  const client = getSupabase();
  await ensureAccount();
  const notional = order.quantityUsd * order.leverage;
  const currentClose = await getLatestClose(order.datasourceId, order.symbol, order.price);
  const quantity = notional / currentClose;
  const { error } = await client.from("paper_orders").insert({
    account_id: ACCOUNT_ID,
    datasource_id: order.datasourceId,
    exchange: order.exchange,
    symbol: order.symbol,
    side: order.side,
    type: "limit",
    status: "pending",
    quantity,
    price: order.price,
    leverage: order.leverage,
    reduce_only: false,
    notional,
    fee: 0,
    realized_pnl: 0,
  });
  if (error) throw new Error(error.message);

  return readPaperTradingState();
}

export async function cancelPaperOrder(orderId: string) {
  const { error } = await getSupabase()
    .from("paper_orders")
    .update({ status: "canceled" })
    .eq("account_id", ACCOUNT_ID)
    .eq("id", orderId)
    .eq("status", "pending");

  if (error) throw new Error(error.message);
  return readPaperTradingState();
}

export async function resetPaperTradingAccount() {
  const client = getSupabase();
  const results = await Promise.all([
    client.from("paper_fills").delete().eq("account_id", ACCOUNT_ID),
    client.from("paper_orders").delete().eq("account_id", ACCOUNT_ID),
    client.from("paper_positions").delete().eq("account_id", ACCOUNT_ID),
  ]);
  const deleteError = results.find((result) => result.error)?.error;
  if (deleteError) throw new Error(deleteError.message);

  const { error } = await client
    .from("paper_accounts")
    .update({ cash_balance: 100000, realized_pnl: 0 })
    .eq("id", ACCOUNT_ID);

  if (error) throw new Error(error.message);
  return readPaperTradingState();
}
