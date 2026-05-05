import type { Metadata } from "next";
import React from "react";
import { ExchangeAccountDashboard } from "@/components/accounts/exchange-account-dashboard";

export const metadata: Metadata = {
  title:
    "Mint Dashboard",
  description: "Mint dashboard",
};

export default function Ecommerce() {
  return <ExchangeAccountDashboard />;
}
