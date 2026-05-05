"use client";

import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type ExchangeId = "BINANCE" | "OKX" | "BYBIT";
type PositionSide = "Long" | "Short";
type OrderStatus = "Filled" | "Canceled" | "Partially Filled";

type AccountSnapshot = {
  exchange: ExchangeId;
  label: string;
  equity: number;
  available: number;
  marginUsed: number;
  unrealizedPnl: number;
  realizedPnl24h: number;
  openPositions: number;
  openOrders: number;
  health: "Online" | "Degraded";
  latencyMs: number;
};

type Position = {
  id: string;
  exchange: ExchangeId;
  symbol: string;
  side: PositionSide;
  size: number;
  entry: number;
  mark: number;
  liquidation: number;
  leverage: number;
  margin: number;
  pnl: number;
  roe: number;
};

type Order = {
  id: string;
  time: string;
  exchange: ExchangeId;
  symbol: string;
  side: "Buy" | "Sell";
  type: "Market" | "Limit" | "Stop";
  price: number;
  amount: number;
  status: OrderStatus;
  fee: number;
};

const accounts: AccountSnapshot[] = [
  {
    exchange: "BINANCE",
    label: "Binance Futures",
    equity: 128430.42,
    available: 84210.18,
    marginUsed: 44220.24,
    unrealizedPnl: 4210.72,
    realizedPnl24h: 1288.4,
    openPositions: 9,
    openOrders: 14,
    health: "Online",
    latencyMs: 84,
  },
  {
    exchange: "OKX",
    label: "OKX Perpetual",
    equity: 76420.16,
    available: 50210.33,
    marginUsed: 26209.83,
    unrealizedPnl: -820.35,
    realizedPnl24h: 442.19,
    openPositions: 5,
    openOrders: 7,
    health: "Online",
    latencyMs: 112,
  },
  {
    exchange: "BYBIT",
    label: "Bybit Unified",
    equity: 39284.9,
    available: 25418.7,
    marginUsed: 13866.2,
    unrealizedPnl: 680.14,
    realizedPnl24h: -216.52,
    openPositions: 4,
    openOrders: 6,
    health: "Degraded",
    latencyMs: 268,
  },
];

const positions: Position[] = [
  { id: "p1", exchange: "BINANCE", symbol: "BTC/USDT", side: "Long", size: 1.84, entry: 63920.5, mark: 65420.3, liquidation: 58420.2, leverage: 8, margin: 14701.7, pnl: 2759.63, roe: 18.77 },
  { id: "p2", exchange: "BINANCE", symbol: "ETH/USDT", side: "Short", size: 18.2, entry: 3280.1, mark: 3218.4, liquidation: 3560.9, leverage: 6, margin: 9761.4, pnl: 1122.94, roe: 11.5 },
  { id: "p3", exchange: "OKX", symbol: "SOL/USDT", side: "Long", size: 420, entry: 142.2, mark: 139.84, liquidation: 118.4, leverage: 5, margin: 11746.56, pnl: -991.2, roe: -8.44 },
  { id: "p4", exchange: "BYBIT", symbol: "LINK/USDT", side: "Long", size: 3100, entry: 14.18, mark: 14.54, liquidation: 11.62, leverage: 4, margin: 11268.5, pnl: 1116, roe: 9.9 },
  { id: "p5", exchange: "OKX", symbol: "DOGE/USDT", side: "Short", size: 168000, entry: 0.1624, mark: 0.1651, liquidation: 0.1872, leverage: 3, margin: 9245.6, pnl: -453.6, roe: -4.91 },
];

const orders: Order[] = [
  { id: "o1", time: "14:28:11", exchange: "BINANCE", symbol: "BTC/USDT", side: "Buy", type: "Limit", price: 65200, amount: 0.42, status: "Filled", fee: 10.96 },
  { id: "o2", time: "14:11:40", exchange: "OKX", symbol: "SOL/USDT", side: "Sell", type: "Stop", price: 138.8, amount: 120, status: "Partially Filled", fee: 2.18 },
  { id: "o3", time: "13:58:05", exchange: "BYBIT", symbol: "LINK/USDT", side: "Buy", type: "Market", price: 14.41, amount: 900, status: "Filled", fee: 7.78 },
  { id: "o4", time: "13:35:22", exchange: "BINANCE", symbol: "ETH/USDT", side: "Sell", type: "Limit", price: 3230, amount: 6.5, status: "Canceled", fee: 0 },
  { id: "o5", time: "12:54:18", exchange: "OKX", symbol: "DOGE/USDT", side: "Sell", type: "Limit", price: 0.1648, amount: 72000, status: "Filled", fee: 5.21 },
];

const equityCurve = [221400, 224120, 222880, 228450, 231040, 230210, 235800, 238640, 236920, 241200, 243020, 244135];
const pnlBars = [620, -240, 1180, 940, -420, 1620, 820, 1320, -310, 1840, 1160, 1514];

function currency(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(value);
}

function number(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function percent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

const totalEquity = accounts.reduce((sum, item) => sum + item.equity, 0);
const totalAvailable = accounts.reduce((sum, item) => sum + item.available, 0);
const totalMargin = accounts.reduce((sum, item) => sum + item.marginUsed, 0);
const totalUnrealized = accounts.reduce((sum, item) => sum + item.unrealizedPnl, 0);
const totalRealized24h = accounts.reduce((sum, item) => sum + item.realizedPnl24h, 0);
const marginRatio = (totalMargin / totalEquity) * 100;

const equityOptions: ApexOptions = {
  chart: {
    type: "area",
    height: 310,
    toolbar: { show: false },
    sparkline: { enabled: false },
    fontFamily: "Outfit, sans-serif",
  },
  colors: ["#22ab94", "#465fff"],
  dataLabels: { enabled: false },
  fill: {
    type: "gradient",
    gradient: { opacityFrom: 0.36, opacityTo: 0.02 },
  },
  grid: {
    borderColor: "rgba(148, 163, 184, 0.16)",
    strokeDashArray: 4,
  },
  legend: { show: false },
  stroke: { curve: "smooth", width: [3, 0] },
  xaxis: {
    categories: ["04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00", "00:00", "Now"],
    labels: { style: { colors: "#98a2b3" } },
    axisBorder: { show: false },
    axisTicks: { show: false },
  },
  yaxis: {
    labels: {
      formatter: (value) => `$${Math.round(value / 1000)}k`,
      style: { colors: ["#98a2b3"] },
    },
  },
  tooltip: {
    theme: "dark",
    y: { formatter: (value) => currency(value) },
  },
};

const pnlOptions: ApexOptions = {
  chart: {
    type: "bar",
    height: 140,
    toolbar: { show: false },
    sparkline: { enabled: true },
  },
  colors: pnlBars.map((value) => (value >= 0 ? "#22ab94" : "#f04438")),
  plotOptions: {
    bar: {
      borderRadius: 3,
      columnWidth: "56%",
      distributed: true,
    },
  },
  dataLabels: { enabled: false },
  tooltip: {
    theme: "dark",
    y: { formatter: (value) => currency(value) },
  },
};

export function ExchangeAccountDashboard() {
  return (
    <div className="min-h-full space-y-5">
      <DashboardHeader />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total Equity" value={currency(totalEquity)} detail={`${currency(totalAvailable)} available`} tone="brand" />
        <MetricCard label="Unrealized PnL" value={currency(totalUnrealized)} detail={`${currency(totalRealized24h)} realized 24h`} tone={totalUnrealized >= 0 ? "success" : "error"} />
        <MetricCard label="Margin Used" value={currency(totalMargin)} detail={`${marginRatio.toFixed(1)}% account exposure`} tone="warning" />
        <MetricCard label="Open Risk" value={`${positions.length} positions`} detail={`${accounts.reduce((sum, item) => sum + item.openOrders, 0)} active orders`} tone="neutral" />
      </div>

      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-8">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Account Equity</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Demo snapshot prepared for CCXT account sync</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="h-2 w-2 rounded-full bg-success-500" />
              <span>Auto refresh ready</span>
            </div>
          </div>
          <Chart
            options={equityOptions}
            series={[
              { name: "Equity", data: equityCurve },
              { name: "PnL", type: "bar", data: pnlBars.map((item, index) => equityCurve[index] + item) },
            ]}
            type="area"
            height={310}
          />
        </section>

        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-4">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">24h PnL Rhythm</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Hourly realized and unrealized flow</p>
          </div>
          <Chart options={pnlOptions} series={[{ name: "PnL", data: pnlBars }]} type="bar" height={140} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MiniStat label="Win rate" value="62.4%" />
            <MiniStat label="Avg fee" value="$6.29" />
            <MiniStat label="Max DD" value="-2.8%" />
            <MiniStat label="Funding" value="+$84" />
          </div>
        </section>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-4">
          <SectionTitle title="Exchange Accounts" subtitle="Binance, OKX, Bybit connection state" />
          <div className="mt-4 space-y-3">
            {accounts.map((account) => (
              <ExchangeAccountRow key={account.exchange} account={account} />
            ))}
          </div>
        </section>

        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-8">
          <SectionTitle title="Open Positions" subtitle="Perpetual exposure and liquidation distance" />
          <PositionsTable />
        </section>
      </div>

      <div className="grid grid-cols-12 gap-5">
        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-7">
          <SectionTitle title="Order History" subtitle="Recent fills, cancels, and partial executions" />
          <OrdersTable />
        </section>

        <section className="col-span-12 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] xl:col-span-5">
          <SectionTitle title="Exposure Map" subtitle="Capital distribution by venue" />
          <div className="mt-5 space-y-4">
            {accounts.map((account) => (
              <ExposureRow key={account.exchange} account={account} />
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Next integration</span>
              <span className="font-medium text-gray-800 dark:text-white/90">CCXT private endpoints</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Environment keys can map to Binance, OKX and Bybit adapters for balances, positions, open orders and closed orders.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function DashboardHeader() {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">CMR</span>
          <span className="text-xs text-gray-400">Demo trading account monitor</span>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Exchange Account Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Portfolio, positions, orders and risk overview for Binance, OKX and Bybit accounts.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Accounts" value="3" />
        <MiniStat label="Positions" value={String(positions.length)} />
        <MiniStat label="Latency" value="155ms" />
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "brand" | "success" | "error" | "warning" | "neutral" }) {
  const toneClass = {
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
    error: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400",
    warning: "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400",
    neutral: "bg-gray-100 text-gray-600 dark:bg-white/[0.07] dark:text-gray-300",
  }[tone];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <h3 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{value}</h3>
        </div>
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${toneClass}`}>Live</span>
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
    </div>
  );
}

function ExchangeAccountRow({ account }: { account: AccountSnapshot }) {
  const usage = (account.marginUsed / account.equity) * 100;
  return (
    <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white">{account.label}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {account.openPositions} positions / {account.openOrders} orders / {account.latencyMs}ms
          </p>
        </div>
        <span className={`rounded-md px-2 py-1 text-xs font-medium ${account.health === "Online" ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400" : "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400"}`}>
          {account.health}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-gray-500 dark:text-gray-400">Equity</span>
        <span className="font-semibold text-gray-900 dark:text-white">{currency(account.equity)}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(usage, 100)}%` }} />
      </div>
    </div>
  );
}

function PositionsTable() {
  return (
    <div className="mt-4 overflow-x-auto custom-scrollbar">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow className="border-b border-gray-100 dark:border-gray-800">
            {["Symbol", "Exchange", "Side", "Size", "Entry / Mark", "Liq.", "Margin", "PnL / ROE"].map((header) => (
              <TableCell key={header} isHeader className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400">
                {header}
              </TableCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position) => (
            <TableRow key={position.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/70">
              <TableCell className="px-3 py-3 text-sm font-medium text-gray-900 dark:text-white">{position.symbol}</TableCell>
              <TableCell className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{position.exchange}</TableCell>
              <TableCell className="px-3 py-3">
                <span className={`rounded-md px-2 py-1 text-xs font-medium ${position.side === "Long" ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400" : "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400"}`}>
                  {position.side} {position.leverage}x
                </span>
              </TableCell>
              <TableCell className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">{number(position.size, 4)}</TableCell>
              <TableCell className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">{number(position.entry)} / {number(position.mark)}</TableCell>
              <TableCell className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{number(position.liquidation)}</TableCell>
              <TableCell className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">{currency(position.margin)}</TableCell>
              <TableCell className={`px-3 py-3 text-sm font-semibold ${position.pnl >= 0 ? "text-success-500" : "text-error-500"}`}>
                {currency(position.pnl)} / {percent(position.roe)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function OrdersTable() {
  return (
    <div className="mt-4 overflow-x-auto custom-scrollbar">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="border-b border-gray-100 dark:border-gray-800">
            {["Time", "Symbol", "Exchange", "Side", "Type", "Price", "Amount", "Status"].map((header) => (
              <TableCell key={header} isHeader className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-400">
                {header}
              </TableCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/70">
              <TableCell className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{order.time}</TableCell>
              <TableCell className="px-3 py-3 text-sm font-medium text-gray-900 dark:text-white">{order.symbol}</TableCell>
              <TableCell className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{order.exchange}</TableCell>
              <TableCell className={`px-3 py-3 text-sm font-medium ${order.side === "Buy" ? "text-success-500" : "text-error-500"}`}>{order.side}</TableCell>
              <TableCell className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">{order.type}</TableCell>
              <TableCell className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">{number(order.price, order.price < 1 ? 6 : 2)}</TableCell>
              <TableCell className="px-3 py-3 text-sm text-gray-700 dark:text-gray-300">{number(order.amount, 4)}</TableCell>
              <TableCell className="px-3 py-3">
                <span className={`rounded-md px-2 py-1 text-xs font-medium ${order.status === "Filled" ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400" : order.status === "Canceled" ? "bg-gray-100 text-gray-500 dark:bg-white/[0.07] dark:text-gray-300" : "bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-warning-400"}`}>
                  {order.status}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ExposureRow({ account }: { account: AccountSnapshot }) {
  const equityShare = (account.equity / totalEquity) * 100;
  const pnlTone = account.unrealizedPnl >= 0 ? "text-success-500" : "text-error-500";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-gray-800 dark:text-white/90">{account.exchange}</span>
        <span className="text-gray-500 dark:text-gray-400">{equityShare.toFixed(1)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${equityShare}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-gray-500 dark:text-gray-400">{currency(account.equity)}</span>
        <span className={pnlTone}>{currency(account.unrealizedPnl)}</span>
      </div>
    </div>
  );
}
