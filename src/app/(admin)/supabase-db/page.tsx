import { SupabaseDbControl } from "@/components/settings/supabase-db-control";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Supabase DB | Mint",
  description: "Clear Supabase monitor tables for testing",
};

export default function SupabaseDbPage() {
  return <SupabaseDbControl />;
}
