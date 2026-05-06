"use client";

import { startMonitorWorker } from "@/lib/monitor/monitor-worker-client";
import { useEffect } from "react";

export function MonitorWorkerBootstrap() {
  useEffect(() => {
    startMonitorWorker();
  }, []);

  return null;
}
