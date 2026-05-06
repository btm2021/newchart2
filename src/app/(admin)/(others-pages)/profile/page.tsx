import { ProfileSettingsPanel } from "@/components/profile/profile-settings-panel";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Profile | Mint",
  description:
    "User profile and exchange access settings",
};

export default function Profile() {
  return <ProfileSettingsPanel />;
}
