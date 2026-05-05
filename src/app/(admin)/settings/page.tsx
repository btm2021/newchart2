import type { Metadata } from "next";
import { AppSettingsPanel } from "@/components/settings/app-settings-panel";

export const metadata: Metadata = {
  title: "Settings | Mint Dashboard",
  description: "Application settings stored in Supabase",
};

export default function SettingsPage() {
  return <AppSettingsPanel />;
}
