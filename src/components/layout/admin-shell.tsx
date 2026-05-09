"use client";

import { AppLogCapture } from "@/components/logs/app-log-capture";
import { AppLogPanel } from "@/components/logs/app-log-panel";
import { useSidebar } from "@/context/SidebarContext";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { usePathname } from "next/navigation";
import React, { useEffect } from "react";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { isExpanded, isMobileOpen } = useSidebar();
  const pathname = usePathname();
  const isChartPage = pathname === "/chart";

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded
      ? "lg:ml-[240px]"
      : "lg:ml-[64px]";
  const logPanelOffset = isMobileOpen
    ? "left-0"
    : isExpanded
      ? "left-0 lg:left-[240px]"
      : "left-0 lg:left-[64px]";

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => undefined);
  }, []);

  return (
    <div className="min-h-screen pb-10 xl:flex">
      <AppLogCapture />
      <AppSidebar />
      <Backdrop />
      <div
        className={`flex-1 transition-all  duration-300 ease-in-out ${mainContentMargin}`}
      >
        <div
          className={
            isChartPage
              ? "h-dvh overflow-hidden p-0"
              : "min-h-dvh p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6"
          }
        >
          {children}
        </div>
      </div>
      <AppLogPanel offsetClassName={logPanelOffset} />
    </div>
  );
}
