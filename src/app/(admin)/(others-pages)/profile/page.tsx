import { MonitorDataTable } from "@/components/settings/monitor-data-table";
import { MonitorSettingsForm } from "@/components/settings/monitor-settings-form";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Setting | Mint",
  description:
    "Settings for Mint",
};

export default function Profile() {
  return (
    <div className="space-y-6">
      <MonitorSettingsForm />
      <MonitorDataTable />
    </div>
  );
}
