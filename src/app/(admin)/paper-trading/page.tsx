import type { Metadata } from "next";
import { PaperTradingPanel } from "@/components/paper-trading/paper-trading-panel";

export const metadata: Metadata = {
  title: "Paper Trading | Mint Dashboard",
  description: "Supabase-backed paper trading account",
};

export default function PaperTradingPage() {
  return <PaperTradingPanel />;
}
