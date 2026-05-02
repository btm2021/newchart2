"use client";

import type { Bar } from "@/lib/types/charting";

type MiniLineChartProps = {
  bars: Bar[];
  height?: number;
};

function buildPath(values: number[], width: number, height: number) {
  if (values.length === 0) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;

  return values
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function MiniLineChart({ bars, height = 128 }: MiniLineChartProps) {
  const width = 420;
  const closes = bars.slice(-80).map((bar) => bar.close);
  const path = buildPath(closes, width, height);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const isUp = first === undefined || last === undefined ? true : last >= first;
  const stroke = isUp ? "#10B981" : "#F04438";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-full w-full overflow-visible"
      preserveAspectRatio="none"
      role="img"
      aria-label="OHLCV close line chart"
    >
      <defs>
        <linearGradient id={`line-fill-${stroke.replace("#", "")}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {path ? (
        <>
          <path d={`M0 ${height} ${path.replace(/^M/, "L")} L${width} ${height} Z`} fill={`url(#line-fill-${stroke.replace("#", "")})`} />
          <path d={path} fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
        </>
      ) : null}
      <line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke="#E4E7EC" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
