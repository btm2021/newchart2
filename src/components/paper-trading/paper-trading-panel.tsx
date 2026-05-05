"use client";

import { useEffect, useMemo, useState } from "react";
import { TradingViewHost } from "@/components/chart/tradingview-host";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import type { PaperOrder, PaperTradingState, PlacePaperOrderRequest } from "@/lib/paper-trading/paper-trading-types";

const SOURCES = [
  { value: "BINANCE_FUTURES", label: "Binance Futures", exchange: "Binance Futures" },
  { value: "OKX_PERP", label: "OKX Perpetual", exchange: "OKX Perpetual" },
  { value: "BINANCE_SPOT", label: "Binance Spot", exchange: "Binance Spot" },
];

const initialOrder: PlacePaperOrderRequest = {
  datasourceId: "BINANCE_FUTURES",
  exchange: "Binance Futures",
  symbol: "BTC/USDT",
  side: "buy",
  type: "limit",
  quantityUsd: 100,
  price: 65000,
  leverage: 20,
};

type TradeTab = "positions" | "orders" | "history";

export function PaperTradingPanel() {
  const [state, setState] = useState<PaperTradingState | null>(null);
  const [order, setOrder] = useState<PlacePaperOrderRequest>(initialOrder);
  const [activeTab, setActiveTab] = useState<TradeTab>("positions");
  const [status, setStatus] = useState<"loading" | "ready" | "submitting" | "error">("loading");
  const [message, setMessage] = useState("");

  const activeSource = SOURCES.find((source) => source.value === order.datasourceId) ?? SOURCES[0];
  const activeMarketKey = `${order.datasourceId}:${order.symbol}`;
  const chartSymbol = `${order.datasourceId}:${order.symbol}`;
  const lastPrice = state?.metrics.lastPrices[activeMarketKey] ?? order.price;
  const estimatedNotional = order.quantityUsd * order.leverage;
  const estimatedQuantity = estimatedNotional / Math.max(lastPrice, 1);
  const pendingOrders = useMemo(() => state?.orders.filter((item) => item.status === "pending") ?? [], [state?.orders]);

  async function loadState() {
    try {
      const response = await fetch("/api/paper-trading", { cache: "no-store" });
      const payload = await response.json() as PaperTradingState & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load paper trading state.");
      setState(payload);
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load paper trading state.");
      setStatus("error");
    }
  }

  useEffect(() => {
    setStatus("loading");
    void loadState();
    const interval = window.setInterval(() => {
      void loadState();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, []);

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/paper-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "place-order", order }),
      });
      const payload = await response.json() as PaperTradingState & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not place limit order.");
      setState(payload);
      setActiveTab("orders");
      setMessage("Limit order submitted.");
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not place limit order.");
      setStatus("error");
    }
  }

  async function cancelOrder(orderId: string) {
    setStatus("submitting");
    try {
      const response = await fetch("/api/paper-trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel-order", orderId }),
      });
      const payload = await response.json() as PaperTradingState & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not cancel order.");
      setState(payload);
      setMessage("Limit order canceled.");
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not cancel order.");
      setStatus("error");
    }
  }

  const updateOrder = <K extends keyof PlacePaperOrderRequest>(key: K, value: PlacePaperOrderRequest[K]) => {
    setOrder((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="grid h-[calc(100dvh-32px)] min-h-[720px] grid-rows-[minmax(0,1fr)_230px] overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <main className="grid min-h-0 grid-cols-12 overflow-hidden">
        <section className="col-span-12 min-h-0 border-b border-gray-100 dark:border-gray-800 xl:col-span-9 xl:border-b-0 xl:border-r">
          <div className="flex h-12 items-center gap-5 border-b border-gray-100 px-4 dark:border-gray-800">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{order.symbol} Perp</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">{activeSource.label}</div>
            </div>
            <div className="text-lg font-semibold text-success-500">{number(lastPrice, 6)}</div>
            <MarketStat label="Equity" value={currency(state?.metrics.equity ?? 0)} />
            <MarketStat label="Available" value={currency(state?.metrics.available ?? 0)} />
            <MarketStat label="Margin" value={currency(state?.metrics.marginUsed ?? 0)} />
            <MarketStat label="Open PnL" value={currency(state?.metrics.unrealizedPnl ?? 0)} tone={(state?.metrics.unrealizedPnl ?? 0) >= 0 ? "up" : "down"} />
          </div>
          <div className="chart-page h-[calc(100%-48px)]">
            <TradingViewHost
              symbol={chartSymbol}
              interval="15"
              chartType="candles"
              keepScreenAwake={false}
              compact
            />
          </div>
        </section>

        <aside className="col-span-12 min-h-0 overflow-auto bg-gray-50 p-4 custom-scrollbar dark:bg-gray-950 xl:col-span-3">
          <form onSubmit={submitOrder} className="space-y-4">
            <div className="grid grid-cols-2 gap-1 rounded-md bg-gray-100 p-1 dark:bg-white/[0.06]">
              <button type="button" onClick={() => updateOrder("side", "buy")} className={`h-9 rounded text-sm font-semibold ${order.side === "buy" ? "bg-success-500 text-white" : "text-gray-500 dark:text-gray-400"}`}>Buy/Long</button>
              <button type="button" onClick={() => updateOrder("side", "sell")} className={`h-9 rounded text-sm font-semibold ${order.side === "sell" ? "bg-error-500 text-white" : "text-gray-500 dark:text-gray-400"}`}>Sell/Short</button>
            </div>

            <SelectField
              label="Source"
              value={order.datasourceId}
              options={SOURCES.map((source) => source.value)}
              onChange={(value) => {
                const source = SOURCES.find((item) => item.value === value) ?? SOURCES[0];
                updateOrder("datasourceId", source.value);
                updateOrder("exchange", source.exchange);
              }}
            />
            <TextField label="Symbol" value={order.symbol} onChange={(value) => updateOrder("symbol", value.toUpperCase())} />
            <StaticField label="Order Type" value="Limit" />
            <NumberField label="Price" value={order.price} step="0.0001" onChange={(value) => updateOrder("price", value)} />
            <NumberField label="Margin USDT" value={order.quantityUsd} step="1" onChange={(value) => updateOrder("quantityUsd", value)} />
            <NumberField label="Leverage" value={order.leverage} step="1" onChange={(value) => updateOrder("leverage", value)} />

            <div className="space-y-2 rounded-md border border-gray-200 bg-white p-3 text-xs dark:border-gray-800 dark:bg-white/[0.03]">
              <InfoRow label="Notional" value={currency(estimatedNotional)} />
              <InfoRow label="Est. Qty at mark" value={`${number(estimatedQuantity, 8)} ${order.symbol.split("/")[0]}`} />
              <InfoRow label="Default" value="100 x 20" />
              <InfoRow label="Pending" value={String(pendingOrders.length)} />
            </div>

            <button
              type="submit"
              disabled={status === "submitting" || status === "loading"}
              className={`h-11 w-full rounded-md text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                order.side === "buy" ? "bg-success-500 hover:bg-success-600" : "bg-error-500 hover:bg-error-600"
              }`}
            >
              {status === "submitting" ? "Submitting..." : `${order.side === "buy" ? "Buy/Long" : "Sell/Short"}`}
            </button>
          </form>
          {message ? (
            <div className={`mt-4 rounded-md px-3 py-2 text-xs ${status === "error" ? "bg-error-500/10 text-error-500" : "bg-success-500/10 text-success-500"}`}>
              {message}
            </div>
          ) : null}
        </aside>
      </main>

      <footer className="min-h-0 overflow-hidden border-t border-gray-100 dark:border-gray-800">
        <div className="flex h-10 items-center gap-1 border-b border-gray-100 px-3 dark:border-gray-800">
          <TabButton active={activeTab === "positions"} onClick={() => setActiveTab("positions")}>Positions ({state?.positions.length ?? 0})</TabButton>
          <TabButton active={activeTab === "orders"} onClick={() => setActiveTab("orders")}>Open Orders ({pendingOrders.length})</TabButton>
          <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")}>History</TabButton>
        </div>
        <div className="h-[calc(100%-40px)] overflow-auto p-3 custom-scrollbar">
          {activeTab === "positions" ? <PositionsTable state={state} /> : null}
          {activeTab === "orders" ? <OrdersTable orders={pendingOrders} onCancel={(orderId) => void cancelOrder(orderId)} emptyText="No open orders." /> : null}
          {activeTab === "history" ? <HistoryTable state={state} /> : null}
        </div>
      </footer>
    </div>
  );
}

function MarketStat({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="hidden lg:block">
      <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-xs font-semibold ${tone === "up" ? "text-success-500" : tone === "down" ? "text-error-500" : "text-gray-900 dark:text-white"}`}>{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-md px-3 text-sm font-medium transition ${active ? "bg-brand-500/10 text-brand-500" : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function PositionsTable({ state }: { state: PaperTradingState | null }) {
  const positions = state?.positions ?? [];
  return (
    <Table className="min-w-[900px]">
      <TableHeader>
        <TableRow className="border-b border-gray-100 dark:border-gray-800">
          {["Symbol", "Side", "Size", "Entry", "Mark", "Margin", "Unrealized PnL", "Updated"].map((header) => (
            <TableCell key={header} isHeader className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-400">{header}</TableCell>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.length === 0 ? (
          <TableRow><TableCell colSpan={8} className="px-3 py-10 text-center text-sm text-gray-500 dark:text-gray-400">No open positions.</TableCell></TableRow>
        ) : positions.map((position) => (
          <TableRow key={position.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/70">
            <TableCell className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">{position.symbol}</TableCell>
            <TableCell className={position.side === "long" ? "px-3 py-2 text-sm font-semibold text-success-500" : "px-3 py-2 text-sm font-semibold text-error-500"}>{position.side} {position.leverage}x</TableCell>
            <TableCell className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{number(position.quantity, 8)}</TableCell>
            <TableCell className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{number(position.entryPrice, 6)}</TableCell>
            <TableCell className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{number(position.markPrice, 6)}</TableCell>
            <TableCell className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{currency(position.margin)}</TableCell>
            <TableCell className={position.unrealizedPnl >= 0 ? "px-3 py-2 text-sm font-semibold text-success-500" : "px-3 py-2 text-sm font-semibold text-error-500"}>{currency(position.unrealizedPnl)}</TableCell>
            <TableCell className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{new Date(position.updatedAt).toLocaleTimeString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OrdersTable({ orders, onCancel, emptyText }: { orders: PaperOrder[]; onCancel: (orderId: string) => void; emptyText: string }) {
  return (
    <Table className="min-w-[980px]">
      <TableHeader>
        <TableRow className="border-b border-gray-100 dark:border-gray-800">
          {["Time", "Symbol", "Side", "Margin", "Lev.", "Qty", "Limit", "Status", ""].map((header) => (
            <TableCell key={header || "action"} isHeader className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-400">{header}</TableCell>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.length === 0 ? (
          <TableRow><TableCell colSpan={9} className="px-3 py-10 text-center text-sm text-gray-500 dark:text-gray-400">{emptyText}</TableCell></TableRow>
        ) : orders.map((order) => (
          <TableRow key={order.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/70">
            <TableCell className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{new Date(order.createdAt).toLocaleTimeString()}</TableCell>
            <TableCell className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-white">{order.symbol}</TableCell>
            <TableCell className={order.side === "buy" ? "px-3 py-2 text-sm font-semibold text-success-500" : "px-3 py-2 text-sm font-semibold text-error-500"}>{order.side}</TableCell>
            <TableCell className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{currency(order.quantityUsd)}</TableCell>
            <TableCell className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{order.leverage}x</TableCell>
            <TableCell className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{number(order.quantity, 8)}</TableCell>
            <TableCell className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300">{number(order.price, 6)}</TableCell>
            <TableCell className="px-3 py-2"><StatusBadge status={order.status} /></TableCell>
            <TableCell className="px-3 py-2 text-right">
              {order.status === "pending" ? <button type="button" onClick={() => onCancel(order.id)} className="text-sm font-medium text-error-500 hover:text-error-600">Cancel</button> : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HistoryTable({ state }: { state: PaperTradingState | null }) {
  const history = state?.orders.filter((order) => order.status !== "pending") ?? [];
  return <OrdersTable orders={history} onCancel={() => undefined} emptyText="No order history." />;
}

function StatusBadge({ status }: { status: PaperOrder["status"] }) {
  const className = {
    filled: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
    pending: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
    canceled: "bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300",
    rejected: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400",
  }[status];
  return <span className={`rounded-md px-2 py-1 text-xs font-medium ${className}`}>{status}</span>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-gray-500 dark:text-gray-400"><span>{label}</span><span>{value}</span></div>;
}

function StaticField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <div className="mt-1 flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">{value}</div>
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90" />
    </label>
  );
}

function NumberField({ label, value, step, onChange }: { label: string; value: number; step: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <input type="number" min="0" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90" />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function number(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}
