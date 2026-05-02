import { OhlcvMonitor } from "@/components/monitor/ohlcv-monitor";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Monitor | Mint",
  description: "Monitor OHLCV across exchanges",
};

export default function MonitorPage() {
  return <OhlcvMonitor />;
}
