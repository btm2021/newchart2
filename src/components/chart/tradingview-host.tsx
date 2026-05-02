"use client";

import dynamic from "next/dynamic";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { getDatasourceRegistry } from "@/lib/datasources/registry";
import { ReplayController } from "@/lib/replay/replay-controller";
import { createChartLayoutStore } from "@/lib/storage/chart-layout-store";
import { createTvSaveLoadAdapter } from "@/lib/storage/tv-save-load-adapter";
import { TradingViewDatafeed } from "@/lib/datasources/tradingview-datafeed";
import type { ChartingLibraryWidget } from "@/lib/types/charting";

const STUDY_SCRIPTS = [
  "/tv-custom-studies/atr-bot.js",
  "/tv-custom-studies/atr-bot-vp.js",
  "/tv-custom-studies/vsr.js",
  "/tv-custom-studies/vsr_1.js",
  "/tv-custom-studies/vidya.js",
  "/tv-custom-studies/session-vp.js",
  "/tv-custom-studies/swing-points.js",
  "/tv-custom-studies/kama.js",
  "/tv-custom-studies/smc.js",
  "/tv-custom-studies/fvg.js",
];

export type TradingViewHostHandle = {
  setSymbol: (symbol: string) => void;
  setInterval: (resolution: string) => void;
  setChartType: (chartType: "candles" | "bars" | "line") => void;
  openIndicators: () => void;
  openSymbolSearch: () => void;
};

type TradingViewHostProps = {
  symbol: string;
  interval: string;
  chartType: "candles" | "bars" | "line";
  keepScreenAwake: boolean;
  onToggleKeepScreenAwake?: () => void;
  onReady?: () => void;
  onChartStateChange?: (payload: { symbol: string; interval: string }) => void;
};

function keepAwakeSvg(active: boolean) {
  const stroke = active ? "#dbe6ff" : "#b2b5be";
  return `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M9 18H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 9h4" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M17.5 13.5v7" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M14 17h7" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
  `;
}

function styleKeepAwakeButton(button: HTMLButtonElement, active: boolean) {
  button.innerHTML = keepAwakeSvg(active);
  button.title = active ? "Keep screen awake: On" : "Keep screen awake: Off";
  button.setAttribute("aria-label", button.title);
  button.setAttribute("aria-pressed", active ? "true" : "false");
  button.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:30px",
    "height:28px",
    "padding:0",
    "border-radius:6px",
    "transition:background-color 120ms ease,color 120ms ease,border-color 120ms ease",
    active ? "background:rgba(41, 98, 255, 0.22)" : "background:transparent",
    active ? "box-shadow:inset 0 0 0 1px rgba(41, 98, 255, 0.42)" : "box-shadow:none",
  ].join(";");
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

function mapChartType(chartType: "candles" | "bars" | "line") {
  switch (chartType) {
    case "bars":
      return 0;
    case "line":
      return 2;
    default:
      return 1;
  }
}

function formatTitlePrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(price);
}

function normalizeTitleSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (!upper) {
    return "Chart";
  }
  if (upper.startsWith("BINANCE_FUTURES:")) {
    return `${upper.slice("BINANCE_FUTURES:".length)}.P`;
  }
  if (upper.startsWith("BINANCE_SPOT:")) {
    return upper.slice("BINANCE_SPOT:".length);
  }
  if (upper.startsWith("OANDA:")) {
    return upper.slice("OANDA:".length);
  }
  return upper;
}

function updateDocumentTitle(symbol: string, price?: number, direction?: "up" | "down" | "flat") {
  const titleSymbol = normalizeTitleSymbol(symbol);
  if (typeof price !== "number") {
    document.title = titleSymbol;
    return;
  }
  const arrow = direction === "up" ? "▲" : direction === "down" ? "▼" : "•";
  document.title = `${titleSymbol} ${formatTitlePrice(price)} ${arrow}`;
}

function TradingViewHostInner({ symbol, interval, chartType, keepScreenAwake, onToggleKeepScreenAwake, onReady, onChartStateChange }: TradingViewHostProps, ref: React.Ref<TradingViewHostHandle>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<ChartingLibraryWidget | null>(null);
  const keepAwakeButtonRef = useRef<HTMLButtonElement | null>(null);
  const replayControllerRef = useRef<ReplayController | null>(null);
  const onReadyRef = useRef(onReady);
  const onChartStateChangeRef = useRef(onChartStateChange);
  const onToggleKeepScreenAwakeRef = useRef(onToggleKeepScreenAwake);
  const symbolRef = useRef(symbol);
  const intervalRef = useRef(interval);
  const chartTypeRef = useRef(chartType);
  const titleStateRef = useRef<{
    symbol: string;
    price?: number;
    direction?: "up" | "down" | "flat";
  }>({
    symbol,
  });
  const [loadingState, setLoadingState] = useState<"loading" | "ready" | "error">("loading");
  const saveLoadAdapter = useMemo(() => createTvSaveLoadAdapter(createChartLayoutStore()), []);
  const datafeed = useMemo(() => new TradingViewDatafeed(), []);
  const getCustomIndicators = useMemo(() => (
    (pineJs: unknown) => Promise.resolve(
      [
        window.createATRBot?.(pineJs),
        window.createATRBotVP?.(pineJs),
        window.createVSR?.(pineJs),
        window.createVSROriginal?.(pineJs),
        window.createSessionVP?.(pineJs),
        window.createSwingPoints?.(pineJs),
        window.createVIDYA?.(pineJs),
        window.createKAMA?.(pineJs),
        window.createSMC?.(pineJs),
        window.createFVG?.(pineJs),
      ].filter(Boolean),
    )
  ), []);

  useEffect(() => {
    onReadyRef.current = onReady;
    onChartStateChangeRef.current = onChartStateChange;
    onToggleKeepScreenAwakeRef.current = onToggleKeepScreenAwake;
    symbolRef.current = symbol;
    intervalRef.current = interval;
    chartTypeRef.current = chartType;
  }, [onReady, onChartStateChange, onToggleKeepScreenAwake, symbol, interval, chartType]);

  useEffect(() => {
    titleStateRef.current = {
      symbol,
      price: undefined,
      direction: undefined,
    };
    updateDocumentTitle(symbol);
  }, [symbol]);

  useEffect(() => {
    const unsubscribe = datafeed.subscribePriceUpdates((update) => {
      const activeSymbol = widgetRef.current?.activeChart().symbol() || symbolRef.current;
      const normalizedActiveSymbol = normalizeTitleSymbol(activeSymbol);
      const normalizedUpdateSymbol = normalizeTitleSymbol(update.symbol);

      if (normalizedActiveSymbol !== normalizedUpdateSymbol) {
        return;
      }

      titleStateRef.current = {
        symbol: update.symbol,
        price: update.price,
        direction: update.direction,
      };
      updateDocumentTitle(update.symbol, update.price, update.direction);
    });

    return () => {
      unsubscribe();
    };
  }, [datafeed]);

  useEffect(() => {
    const replayController = new ReplayController({
      getMainWidget: () => widgetRef.current,
      getCurrentSymbol: () => symbolRef.current,
      getCurrentResolution: () => intervalRef.current,
      getCurrentChartType: () => chartTypeRef.current,
      getCustomIndicators,
    });
    replayController.mount();
    replayControllerRef.current = replayController;

    return () => {
      replayController.unmount();
      replayControllerRef.current = null;
    };
  }, [getCustomIndicators]);

  useImperativeHandle(ref, () => ({
    setSymbol(nextSymbol) {
      widgetRef.current?.activeChart().setSymbol(nextSymbol);
    },
    setInterval(nextInterval) {
      widgetRef.current?.activeChart().setResolution(nextInterval);
    },
    setChartType(nextChartType) {
      widgetRef.current?.activeChart().setChartType(mapChartType(nextChartType));
    },
    openIndicators() {
      widgetRef.current?.activeChart().executeActionById("insertIndicator");
    },
    openSymbolSearch() {
      widgetRef.current?.activeChart().executeActionById("symbolSearch");
    },
  }), []);

  useEffect(() => {
    if (!containerRef.current) return;

    let disposed = false;

    const setup = async () => {
      try {
        await getDatasourceRegistry().initialize();
        await loadScript("/charting_library/charting_library.js");
        for (const script of STUDY_SCRIPTS) {
          await loadScript(script);
        }

        if (disposed || !window.TradingView || !containerRef.current) return;

        const containerId = "tv-chart-container";
        containerRef.current.id = containerId;

        const widget = new window.TradingView.widget({
          symbol,
          interval,
          datafeed,
          container: containerId,
          library_path: "/charting_library/",
          locale: "en",
          timezone: "Asia/Ho_Chi_Minh",
          autosize: true,
          theme: "dark",
          preset: window.matchMedia("(max-width: 1024px)").matches ? "mobile" : undefined,
          load_last_chart: false,
          enabled_features: [
            "header_widget",
            "left_toolbar",
            "control_bar",
            "timeframes_toolbar",
            "show_object_tree",
            "study_templates",
            "items_favoriting",
            "show_symbol_logos",
            "show_exchange_logos",
            "iframe_loading_compatibility_mode",
          ],
          widgetbar: {
            details: true,
            datawindow: true,
            watchlist: true,
            news: false,
          },
          favorites: {
            intervals: ["1", "5", "15", "60", "240", "1D"],
            chartTypes: ["Candles", "Line"],
          },
          save_load_adapter: saveLoadAdapter,
          auto_save_delay: 5,
          custom_css_url: "/charting_library/custom.css",
          custom_indicators_getter: getCustomIndicators,
          overrides: {
            "paneProperties.background": "#131722",
            "paneProperties.vertGridProperties.color": "#1f2733",
            "paneProperties.horzGridProperties.color": "#1f2733",
            "mainSeriesProperties.candleStyle.upColor": "#22ab94",
            "mainSeriesProperties.candleStyle.downColor": "#f23645",
            "mainSeriesProperties.candleStyle.borderUpColor": "#22ab94",
            "mainSeriesProperties.candleStyle.borderDownColor": "#f23645",
            "mainSeriesProperties.candleStyle.wickUpColor": "#22ab94",
            "mainSeriesProperties.candleStyle.wickDownColor": "#f23645",
            "scalesProperties.textColor": "#b2b5be",
          },
        });

        widgetRef.current = widget;
        window.__tvWidget = widget;

        widget.onChartReady(() => {
          if (disposed) return;
          updateDocumentTitle(widget.activeChart().symbol() || symbolRef.current);
          widget.activeChart().setChartType(mapChartType(chartType));
          void replayControllerRef.current?.attachToWidget(widget);
          void widget.headerReady().then(() => {
            if (disposed) return;
            const button = widget.createButton({ align: "right" });
            button.classList.add("tv-keep-awake-button");
            button.addEventListener("click", () => {
              onToggleKeepScreenAwakeRef.current?.();
            });
            keepAwakeButtonRef.current = button;
            styleKeepAwakeButton(button, keepScreenAwake);
          });
          widget.activeChart().onSymbolChanged().subscribe(null, (nextSymbol) => {
            const resolvedSymbol = nextSymbol.full_name || nextSymbol.ticker || widget.activeChart().symbol() || nextSymbol.name;
            titleStateRef.current = {
              symbol: resolvedSymbol,
              price: undefined,
              direction: undefined,
            };
            updateDocumentTitle(titleStateRef.current.symbol);
            onChartStateChangeRef.current?.({
              symbol: resolvedSymbol,
              interval: widget.activeChart().resolution(),
            });
          });
          widget.activeChart().onIntervalChanged().subscribe(null, (nextInterval) => {
            onChartStateChangeRef.current?.({
              symbol: widget.activeChart().symbol(),
              interval: nextInterval,
            });
          });
          setLoadingState("ready");
          onReadyRef.current?.();
        });
      } catch (error) {
        console.error(error);
        if (!disposed) {
          setLoadingState("error");
        }
      }
    };

    void setup();

    return () => {
      disposed = true;
      delete window.__tvWidget;
      keepAwakeButtonRef.current = null;
      widgetRef.current?.remove();
      widgetRef.current = null;
      setLoadingState("loading");
      document.title = "Chart";
    };
  }, [datafeed, saveLoadAdapter, chartType, getCustomIndicators]);

  useEffect(() => {
    if (!keepAwakeButtonRef.current) return;
    styleKeepAwakeButton(keepAwakeButtonRef.current, keepScreenAwake);
  }, [keepScreenAwake]);

  useEffect(() => {
    if (!widgetRef.current || loadingState !== "ready") return;
    const activeChart = widgetRef.current.activeChart();
    if (activeChart.symbol() !== symbol) {
      activeChart.setSymbol(symbol);
    }
  }, [symbol, loadingState]);

  useEffect(() => {
    if (!widgetRef.current || loadingState !== "ready") return;
    const activeChart = widgetRef.current.activeChart();
    if (activeChart.resolution() !== interval) {
      activeChart.setResolution(interval);
    }
  }, [interval, loadingState]);

  useEffect(() => {
    if (!widgetRef.current || loadingState !== "ready") return;
    widgetRef.current.activeChart().setChartType(mapChartType(chartType));
  }, [chartType, loadingState]);

  return (
    <>
      {loadingState === "loading" ? (
        <div className="chart-loading">
          <div className="chart-spinner" />
          <div className="muted">Loading TradingView workspace…</div>
        </div>
      ) : null}
      {loadingState === "error" ? (
        <div className="chart-error">
          <strong>Chart bootstrap failed</strong>
          <div className="muted">Verify the local TradingView library assets are present under <code>/public/charting_library</code>.</div>
        </div>
      ) : null}
      <div ref={containerRef} className="chart-frame" />
    </>
  );
}

export const TradingViewHost = dynamic(
  async () => ({
    default: forwardRef(TradingViewHostInner),
  }),
  { ssr: false },
);
