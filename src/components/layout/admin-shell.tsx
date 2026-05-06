"use client";

import { MonitorWorkerBootstrap } from "@/components/monitor/monitor-worker-bootstrap";
import { useSidebar } from "@/context/SidebarContext";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import { usePathname } from "next/navigation";
import React from "react";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { isExpanded, isMobileOpen } = useSidebar();
  const pathname = usePathname();
  const isChartPage = pathname === "/chart";

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded
      ? "lg:ml-[240px]"
      : "lg:ml-[64px]";

  return (
    <div className="min-h-screen xl:flex">
      <MonitorWorkerBootstrap />
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
    </div>
  );
}
