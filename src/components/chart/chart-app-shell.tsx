"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getDatasourceRegistry } from "@/lib/datasources/registry";
import { TradingViewHost } from "@/components/chart/tradingview-host";
import { useNativePwa } from "@/lib/pwa/use-native-pwa";
import {
  defaultWorkspaceState,
  loadRemoteWorkspaceState,
  loadWorkspaceState,
  saveRemoteWorkspaceState,
  saveWorkspaceState,
  type UserWorkspaceState,
} from "@/lib/storage/workspace-state";

const KNOWN_DATASOURCE_IDS = new Set(["BINANCE_SPOT", "BINANCE_FUTURES", "OKX_PERP", "OANDA"]);

function getDatasourceIdFromSymbol(symbol: string) {
  const datasourceId = symbol.trim().toUpperCase().split(":")[0];
  return KNOWN_DATASOURCE_IDS.has(datasourceId) ? datasourceId : "";
}

function normalizeSymbolForDatasource(symbol: string, datasourceId: string) {
  const upper = symbol.trim().toUpperCase();
  if (!upper) return "";

  const embeddedDatasourceId = getDatasourceIdFromSymbol(upper);
  if (embeddedDatasourceId) return upper;

  if (upper.endsWith(".P")) {
    return `BINANCE_FUTURES:${upper.slice(0, -2)}`;
  }

  if (upper.endsWith(".S")) {
    return `BINANCE_SPOT:${upper.slice(0, -2)}`;
  }

  if (upper.endsWith(".OA") || upper.endsWith(".OANDA")) {
    return `OANDA:${upper.replace(/\.OA$|\.OANDA$/, "")}`;
  }

  return `${datasourceId || "BINANCE_SPOT"}:${upper}`;
}

function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    let registration: ServiceWorkerRegistration | null = null;
    let disposed = false;

    const reloadIfUpdated = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const updateServiceWorker = () => {
      void registration?.update().catch(() => undefined);
      registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
    };

    const triggerUpdateCheck = () => {
      if (!disposed && document.visibilityState === "visible") {
        updateServiceWorker();
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", reloadIfUpdated);
    window.addEventListener("focus", triggerUpdateCheck);
    document.addEventListener("visibilitychange", triggerUpdateCheck);

    navigator.serviceWorker
      .register("/sw.js", {
        updateViaCache: "none",
        scope: "/",
      })
      .then((nextRegistration) => {
        registration = nextRegistration;

        if (registration.waiting) {
          updateServiceWorker();
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration?.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              updateServiceWorker();
            }
          });
        });
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      window.removeEventListener("focus", triggerUpdateCheck);
      document.removeEventListener("visibilitychange", triggerUpdateCheck);
      navigator.serviceWorker.removeEventListener("controllerchange", reloadIfUpdated);
    };
  }, []);

  return null;
}

export function ChartAppShell() {
  const searchParams = useSearchParams();
  const [workspace, setWorkspace] = useState<UserWorkspaceState>(defaultWorkspaceState);
  const [ready, setReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  useNativePwa(workspace.keepScreenAwake);

  useEffect(() => {
    let disposed = false;
    const localWorkspace = loadWorkspaceState();
    const querySymbol = searchParams.get("symbol");
    const queryDatasourceId = searchParams.get("source") || searchParams.get("datasource");
    const queryInterval = searchParams.get("interval");

    function applyWorkspace(savedWorkspace: UserWorkspaceState) {
      const requestedDatasourceId = getDatasourceIdFromSymbol(querySymbol || "")
        || queryDatasourceId?.toUpperCase()
        || savedWorkspace.activeDatasourceId;
      const activeSymbol = querySymbol
        ? normalizeSymbolForDatasource(querySymbol, requestedDatasourceId)
        : normalizeSymbolForDatasource(savedWorkspace.activeSymbol, savedWorkspace.activeDatasourceId);
      const activeDatasourceId = getDatasourceIdFromSymbol(activeSymbol) || requestedDatasourceId;

      return {
        ...savedWorkspace,
        activeSymbol: activeSymbol || savedWorkspace.activeSymbol,
        activeDatasourceId,
        activeInterval: queryInterval || savedWorkspace.activeInterval,
      };
    }

    setWorkspace(applyWorkspace(localWorkspace));
    setReady(true);
    setRemoteReady(false);
    void getDatasourceRegistry().initialize();

    void loadRemoteWorkspaceState()
      .then((remoteWorkspace) => {
        if (disposed) return;
        setWorkspace(applyWorkspace(remoteWorkspace));
        setRemoteReady(true);
      })
      .catch(() => {
        if (!disposed) setRemoteReady(true);
      });

    return () => {
      disposed = true;
    };
  }, [searchParams]);

  useEffect(() => {
    if (!ready) return;
    saveWorkspaceState(workspace);
    if (remoteReady) {
      void saveRemoteWorkspaceState(workspace).catch(() => undefined);
    }
  }, [ready, remoteReady, workspace]);

  return (
    <div className="chart-page">
      <PwaRegistrar />
      <TradingViewHost
        symbol={workspace.activeSymbol}
        interval={workspace.activeInterval}
        chartType={workspace.chartType}
        keepScreenAwake={workspace.keepScreenAwake}
        onToggleKeepScreenAwake={() => {
          setWorkspace((current) => ({
            ...current,
            keepScreenAwake: !current.keepScreenAwake,
          }));
        }}
        onChartStateChange={({ symbol, interval }) => {
          setWorkspace((current) => {
            const activeSymbol = normalizeSymbolForDatasource(symbol, current.activeDatasourceId);
            return {
              ...current,
              activeSymbol,
              activeDatasourceId: getDatasourceIdFromSymbol(activeSymbol) || current.activeDatasourceId,
              activeInterval: interval,
            };
          });
        }}
      />
    </div>
  );
}
