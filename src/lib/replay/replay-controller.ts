import { getDatasourceRegistry } from "@/lib/datasources/registry";
import type { DatasourceAdapter } from "@/lib/datasources/types";
import type { Bar, ChartingLibraryWidget, HistoryMetadata, LibrarySymbolInfo, ResolutionString } from "@/lib/types/charting";

type ReplayState = {
  isActive: boolean;
  isPaused: boolean;
  currentIndex: number;
  totalBars: number;
  speedIndex: number;
};

type ReplayControllerOptions = {
  getMainWidget: () => ChartingLibraryWidget | null;
  getCurrentSymbol: () => string;
  getCurrentResolution: () => string;
  getCurrentChartType: () => "candles" | "bars" | "line";
  getCustomIndicators: (pineJs: unknown) => Promise<unknown[]>;
};

type ReplayCacheEntry = {
  bars: Bar[];
  selectedTime: number;
  startIndex: number;
};

type SelectionState = {
  bars: Bar[];
  selectedIndex: number;
  symbol: string;
  resolution: ResolutionString;
  markerCoordinate: number;
  cursorY: number;
};

const SPEEDS = [
  { label: "0.5x", intervalMs: 2000 },
  { label: "1x", intervalMs: 1000 },
  { label: "2x", intervalMs: 500 },
  { label: "3x", intervalMs: 333 },
  { label: "5x", intervalMs: 200 },
  { label: "10x", intervalMs: 100 },
] as const;

const MIN_VISIBLE_BARS = 50;
const CONTEXT_BARS = 300;
const PREVIEW_BARS = 1500;
const MAX_BARS_PER_REQUEST = 1000;

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

function resolutionToSeconds(resolution: string): number {
  switch (resolution) {
    case "1":
      return 60;
    case "5":
      return 300;
    case "15":
      return 900;
    case "30":
      return 1800;
    case "60":
      return 3600;
    case "240":
      return 14400;
    case "1D":
      return 86400;
    case "1W":
      return 604800;
    case "1M":
      return 2592000;
    default:
      return 900;
  }
}

function formatReplayTime(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-GB", {
    hour12: false,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function replaySvg() {
  return `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 11a9 9 0 1 0 3-6.708L3 7"></path>
      <path d="M3 3v4h4"></path>
      <path d="m9 15 6-3-6-3v6z"></path>
    </svg>
  `;
}

export class ReplayController {
  private readonly options: ReplayControllerOptions;
  private readonly replayCache = new Map<string, ReplayCacheEntry>();
  private replayWidget: ChartingLibraryWidget | null = null;
  private replayContainer: HTMLDivElement | null = null;
  private controlsRoot: HTMLDivElement | null = null;
  private selectionRoot: HTMLDivElement | null = null;
  private headerButton: HTMLButtonElement | null = null;
  private replayHeaderButton: HTMLButtonElement | null = null;
  private mainFrameCursor = "";
  private selectionPointerHandler: ((event: PointerEvent) => void) | null = null;
  private selectionInnerPointerHandler: ((event: MouseEvent) => void) | null = null;
  private selectionCursorFrame: number | null = null;
  private pendingCursorPoint: { clientX?: number; clientY?: number } | null = null;
  private state: ReplayState = {
    isActive: false,
    isPaused: true,
    currentIndex: 0,
    totalBars: 0,
    speedIndex: 1,
  };
  private selectionState: SelectionState | null = null;
  private allBars: Bar[] = [];
  private replaySymbolInfo: LibrarySymbolInfo | null = null;
  private replaySymbol = "";
  private replayResolution: ResolutionString = "15";
  private replayRealtimeCallback: ((bar: Bar) => void) | null = null;
  private replayTimer: number | null = null;
  private selectionMoveFrame: number | null = null;
  private selectionRefreshFrame: number | null = null;
  private pendingMarkerClientX: number | null = null;
  private visibleRangeSubscription: { unsubscribeAll?: () => void } | null = null;
  private loading = false;
  private selecting = false;

  constructor(options: ReplayControllerOptions) {
    this.options = options;
    this.handleKeydown = this.handleKeydown.bind(this);
  }

  mount() {
    this.ensureControls();
    this.ensureSelectionOverlay();
    window.addEventListener("keydown", this.handleKeydown);
  }

  unmount() {
    window.removeEventListener("keydown", this.handleKeydown);
    this.stopReplay();
    this.closeSelectionOverlay();
    this.controlsRoot?.remove();
    this.controlsRoot = null;
    if (this.selectionMoveFrame !== null) {
      window.cancelAnimationFrame(this.selectionMoveFrame);
      this.selectionMoveFrame = null;
    }
    if (this.selectionRefreshFrame !== null) {
      window.cancelAnimationFrame(this.selectionRefreshFrame);
      this.selectionRefreshFrame = null;
    }
    if (this.selectionCursorFrame !== null) {
      window.cancelAnimationFrame(this.selectionCursorFrame);
      this.selectionCursorFrame = null;
    }
    this.selectionRoot?.remove();
    this.selectionRoot = null;
    this.headerButton = null;
  }

  async attachToWidget(widget: ChartingLibraryWidget) {
    await widget.headerReady();
    if (this.headerButton?.isConnected) return;

    this.headerButton = this.createReplayToggleButton(widget);
  }

  private toggleControls() {
    this.ensureControls();
    if (!this.controlsRoot) return;
    const visible = this.controlsRoot.dataset.visible === "true";
    this.controlsRoot.dataset.visible = visible ? "false" : "true";
  }

  private ensureControls() {
    if (this.controlsRoot) return;

    const root = document.createElement("div");
    root.className = "replay-controls";
    root.dataset.visible = "false";
    root.innerHTML = `
      <div class="replay-panel">
        <div class="replay-panel__header">
          <strong>Replay Controls</strong>
          <button type="button" data-action="close">×</button>
        </div>
        <div class="replay-panel__status" data-role="status">Ready</div>
        <div class="replay-panel__section replay-panel__section--progress" data-role="progress-section">
          <div class="replay-panel__progress-text" data-role="progress-text">0 / 0</div>
          <input type="range" min="0" max="100" value="0" data-role="progress-range" />
        </div>
        <div class="replay-panel__section">
          <div class="replay-panel__speed-group" data-role="speed-group"></div>
        </div>
        <div class="replay-panel__actions">
          <button type="button" data-action="back">◀</button>
          <button type="button" data-action="play" class="is-accent">Play</button>
          <button type="button" data-action="forward">▶</button>
          <button type="button" data-action="stop" class="is-danger">Stop</button>
        </div>
      </div>
    `;

    const speedGroup = root.querySelector<HTMLElement>('[data-role="speed-group"]');
    if (speedGroup) {
      speedGroup.innerHTML = SPEEDS.map((speed, index) => `
        <button type="button" data-action="speed" data-speed-index="${index}" ${index === this.state.speedIndex ? 'class="is-active"' : ""}>
          ${speed.label}
        </button>
      `).join("");
    }

    root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const action = target.dataset.action;
      if (!action) return;

      switch (action) {
        case "close":
          this.stopReplay();
          break;
        case "play":
          this.togglePlayPause();
          break;
        case "back":
          this.stepBackward();
          break;
        case "forward":
          this.stepForward();
          break;
        case "stop":
          this.stopReplay();
          break;
        case "speed": {
          const index = Number(target.dataset.speedIndex);
          if (!Number.isNaN(index)) {
            this.setSpeed(index);
          }
          break;
        }
      }
    });

    root.querySelector<HTMLInputElement>('[data-role="progress-range"]')?.addEventListener("input", () => {
      if (!this.state.isActive) return;
      const progressRange = root.querySelector<HTMLInputElement>('[data-role="progress-range"]');
      if (!progressRange) return;
      this.jumpToPercent(Number(progressRange.value));
    });

    document.body.appendChild(root);
    this.controlsRoot = root;
    this.renderControls();
  }

  private ensureSelectionOverlay() {
    if (this.selectionRoot) return;

    const overlay = document.createElement("div");
    overlay.className = "replay-selection";
    overlay.dataset.visible = "false";
    overlay.innerHTML = `
      <div class="replay-selection__scrim"></div>
      <div class="replay-selection__shade" data-role="shade"></div>
      <div class="replay-selection__line" data-role="line"></div>
      <div class="replay-selection__cursor" data-role="cursor" aria-hidden="true">✂</div>
      <div class="replay-selection__stamp" data-role="stamp">
        <span class="replay-selection__stamp-label" data-role="stamp-label"></span>
        <button type="button" class="replay-selection__stamp-button" data-action="start-replay">Start</button>
      </div>
    `;

    const line = overlay.querySelector<HTMLElement>('[data-role="line"]');
    const updateFromPointer = (clientX: number) => {
      const metrics = this.getSelectionPaneMetrics();
      const state = this.selectionState;
      if (!state || !metrics) return;

      const markerCoordinate = Math.max(0, Math.min(metrics.width, clientX - metrics.left));
      this.selectionState = {
        ...state,
        markerCoordinate,
      };
      this.scheduleSelectionRefresh();
    };

    const schedulePointerUpdate = (clientX: number) => {
      this.pendingMarkerClientX = clientX;
      if (this.selectionMoveFrame !== null) return;

      this.selectionMoveFrame = window.requestAnimationFrame(() => {
        this.selectionMoveFrame = null;
        if (this.pendingMarkerClientX !== null) {
          updateFromPointer(this.pendingMarkerClientX);
        }
      });
    };

    let draggingPointerId: number | null = null;
    const onMove = (event: PointerEvent) => {
      if (draggingPointerId !== event.pointerId) return;
      event.preventDefault();
      schedulePointerUpdate(event.clientX);
    };
    const onUp = (event: PointerEvent) => {
      if (draggingPointerId !== event.pointerId) return;
      if (line?.hasPointerCapture(event.pointerId)) {
        line.releasePointerCapture(event.pointerId);
      }
      draggingPointerId = null;
    };

    line?.addEventListener("pointerdown", (event) => {
      draggingPointerId = event.pointerId;
      event.preventDefault();
      event.stopPropagation();
      line.setPointerCapture(event.pointerId);
      schedulePointerUpdate(event.clientX);
    });
    line?.addEventListener("pointermove", onMove);
    line?.addEventListener("pointerup", onUp);
    line?.addEventListener("pointercancel", onUp);
    line?.addEventListener("dblclick", () => {
      void this.confirmSelectionAndStartReplay();
    });
    overlay.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.action === "start-replay") {
        event.preventDefault();
        event.stopPropagation();
        void this.confirmSelectionAndStartReplay();
      }
    });

    this.selectionPointerHandler = (event: PointerEvent) => {
      this.scheduleSelectionCursorUpdate(event.clientX, event.clientY);
    };
    this.selectionInnerPointerHandler = (event: MouseEvent) => {
      const widget = this.options.getMainWidget() as (ChartingLibraryWidget & {
        _iFrame?: HTMLIFrameElement;
      }) | null;
      const frame = widget?._iFrame;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      this.scheduleSelectionCursorUpdate(rect.left + event.clientX, rect.top + event.clientY);
    };

    document.body.appendChild(overlay);
    this.selectionRoot = overlay;
  }

  private renderControls() {
    if (!this.controlsRoot) return;
    const status = this.controlsRoot.querySelector<HTMLElement>('[data-role="status"]');
    const progressSection = this.controlsRoot.querySelector<HTMLElement>('[data-role="progress-section"]');
    const progressText = this.controlsRoot.querySelector<HTMLElement>('[data-role="progress-text"]');
    const progressRange = this.controlsRoot.querySelector<HTMLInputElement>('[data-role="progress-range"]');
    const playButton = this.controlsRoot.querySelector<HTMLElement>('[data-action="play"]');
    const speedButtons = this.controlsRoot.querySelectorAll<HTMLElement>('[data-action="speed"]');
    const stopButton = this.controlsRoot.querySelector<HTMLElement>('[data-action="stop"]');

    if (status) {
      if (this.loading) {
        status.textContent = "Preloading replay bars…";
      } else if (!this.state.isActive) {
        status.textContent = "Ready";
      } else if (this.state.isPaused) {
        status.textContent = "Paused";
      } else {
        status.textContent = "Playing";
      }
    }

    if (progressSection) {
      progressSection.style.display = this.state.isActive ? "block" : "none";
    }

    if (progressText) {
      progressText.textContent = `${this.state.currentIndex} / ${this.state.totalBars}`;
    }

    if (progressRange) {
      const percent = this.state.totalBars > 0 ? Math.round((this.state.currentIndex / this.state.totalBars) * 100) : 0;
      progressRange.value = String(percent);
    }

    if (playButton) {
      playButton.textContent = this.state.isPaused ? "Play" : "Pause";
      playButton.toggleAttribute("disabled", !this.state.isActive);
    }

    speedButtons.forEach((button) => {
      button.classList.toggle("is-active", Number(button.dataset.speedIndex) === this.state.speedIndex);
      button.toggleAttribute("disabled", !this.state.isActive);
    });

    if (stopButton) {
      stopButton.toggleAttribute("disabled", !this.state.isActive);
    }

    [this.headerButton, this.replayHeaderButton].forEach((button) => {
      if (!button) return;
      button.innerHTML = replaySvg();
      button.style.color = this.state.isActive ? "#22ab94" : this.selecting ? "#3b82f6" : "#f59e0b";
      button.title = this.state.isActive ? "Replay running" : this.selecting ? "Press Enter or double-click the marker to start replay" : "Replay";
    });
  }

  private renderSelectionOverlay() {
    if (!this.selectionRoot || !this.selectionState) return;
    const { bars, selectedIndex } = this.selectionState;
    const selectedBar = bars[selectedIndex];
    const metrics = this.getSelectionPaneMetrics();
    if (!metrics) return;

    this.selectionRoot.dataset.visible = "true";

    const shade = this.selectionRoot.querySelector<HTMLElement>('[data-role="shade"]');
    const line = this.selectionRoot.querySelector<HTMLElement>('[data-role="line"]');
    const stamp = this.selectionRoot.querySelector<HTMLElement>('[data-role="stamp"]');
    const stampLabel = this.selectionRoot.querySelector<HTMLElement>('[data-role="stamp-label"]');
    if (shade) {
      shade.style.left = `${metrics.left + this.selectionState.markerCoordinate}px`;
      shade.style.top = `${metrics.top}px`;
      shade.style.width = `${Math.max(0, metrics.width - this.selectionState.markerCoordinate)}px`;
      shade.style.height = `${metrics.height}px`;
    }

    if (line) {
      line.style.left = `${metrics.left + this.selectionState.markerCoordinate}px`;
      line.style.top = `${metrics.top}px`;
      line.style.height = `${metrics.height}px`;
    }

    if (stamp && stampLabel && selectedBar) {
      stamp.style.left = `${metrics.left + this.selectionState.markerCoordinate}px`;
      stamp.style.top = `${metrics.top + metrics.height + 10}px`;
      stampLabel.textContent = `Re: ${this.formatStampTime(selectedBar.time)}`;
    }

    this.updateSelectionCursor();
  }

  private async openSelectionMode() {
    if (this.state.isActive || this.loading || this.selecting) return;
    this.ensureSelectionOverlay();
    this.loading = true;
    this.selecting = true;
    this.renderControls();

    try {
      const symbol = this.options.getCurrentSymbol();
      const resolution = this.options.getCurrentResolution() as ResolutionString;
      const bars = await this.fetchPreviewBars(symbol, resolution);
      if (bars.length < MIN_VISIBLE_BARS + 5) {
        throw new Error("Not enough bars to open replay selection");
      }

      this.selectionState = {
        bars,
        selectedIndex: Math.max(MIN_VISIBLE_BARS, Math.floor(bars.length * 0.65)),
        symbol,
        resolution,
        markerCoordinate: 0,
        cursorY: 0,
      };
      this.selectionState.markerCoordinate = this.getInitialMarkerCoordinate();
      const metrics = this.getSelectionPaneMetrics();
      this.selectionState.cursorY = metrics ? metrics.top + metrics.height / 2 : 0;
      this.scheduleSelectionRefresh();
      this.bindVisibleRangeUpdates();
      this.setSelectionCursorMode(true);
      if (this.selectionPointerHandler) {
        window.addEventListener("pointermove", this.selectionPointerHandler, { passive: true });
      }
      const innerWindow = (this.options.getMainWidget() as (ChartingLibraryWidget & {
        _innerWindow?: () => Window;
      }) | null)?._innerWindow?.();
      if (innerWindow && this.selectionInnerPointerHandler) {
        innerWindow.document.addEventListener("mousemove", this.selectionInnerPointerHandler, { passive: true });
      }
    } catch (error) {
      console.error("[Replay] Failed to open selection mode:", error);
      this.selecting = false;
    } finally {
      this.loading = false;
      this.renderControls();
    }
  }

  private closeSelectionOverlay() {
    this.selecting = false;
    this.visibleRangeSubscription?.unsubscribeAll?.();
    this.visibleRangeSubscription = null;
    if (this.selectionPointerHandler) {
      window.removeEventListener("pointermove", this.selectionPointerHandler);
    }
    const innerWindow = (this.options.getMainWidget() as (ChartingLibraryWidget & {
      _innerWindow?: () => Window;
    }) | null)?._innerWindow?.();
    if (innerWindow && this.selectionInnerPointerHandler) {
      innerWindow.document.removeEventListener("mousemove", this.selectionInnerPointerHandler);
    }
    this.setSelectionCursorMode(false);
    if (this.selectionRefreshFrame !== null) {
      window.cancelAnimationFrame(this.selectionRefreshFrame);
      this.selectionRefreshFrame = null;
    }
    if (this.selectionCursorFrame !== null) {
      window.cancelAnimationFrame(this.selectionCursorFrame);
      this.selectionCursorFrame = null;
    }
    this.pendingCursorPoint = null;
    this.selectionState = null;
    if (this.selectionRoot) {
      this.selectionRoot.dataset.visible = "false";
    }
    if (this.headerButton) {
      this.headerButton.innerHTML = replaySvg();
      this.headerButton.style.color = this.state.isActive ? "#22ab94" : "#f59e0b";
      this.headerButton.title = this.state.isActive ? "Replay running" : "Replay";
    }
    if (this.replayHeaderButton) {
      this.replayHeaderButton.innerHTML = replaySvg();
      this.replayHeaderButton.style.color = this.state.isActive ? "#22ab94" : "#f59e0b";
      this.replayHeaderButton.title = this.state.isActive ? "Replay running" : "Replay";
    }
    this.renderControls();
  }

  private async confirmSelectionAndStartReplay() {
    if (!this.selectionState || this.loading) return;
    const selection = this.selectionState;
    this.loading = true;
    this.ensureControls();
    if (this.controlsRoot) {
      this.controlsRoot.dataset.visible = "true";
    }
    this.closeSelectionOverlay();
    this.renderControls();

    try {
      const { bars, selectedIndex, symbol, resolution } = selection;
      const selectedBar = bars[selectedIndex];
      if (!selectedBar) {
        throw new Error("Replay start point is invalid");
      }

      const replayDataset = await this.preloadReplayDataset(symbol, resolution, selectedBar.time);
      this.replaySymbol = symbol;
      this.replayResolution = resolution;
      this.replaySymbolInfo = await this.resolveSymbol(symbol);
      this.allBars = replayDataset.bars;

      this.state = {
        ...this.state,
        isActive: true,
        isPaused: true,
        currentIndex: replayDataset.startIndex,
        totalBars: replayDataset.bars.length,
      };

      await this.createReplayWidget(this.options.getCurrentChartType());
      this.renderControls();
    } catch (error) {
      console.error("[Replay] Failed to start replay:", error);
    } finally {
      this.loading = false;
      this.renderControls();
    }
  }

  stopReplay() {
    this.clearTimer();
    this.replayWidget?.remove();
    this.replayWidget = null;
    this.replayHeaderButton?.remove();
    this.replayHeaderButton = null;
    this.replayContainer?.remove();
    this.replayContainer = null;
    this.replayRealtimeCallback = null;
    this.allBars = [];
    this.replaySymbolInfo = null;
    this.closeSelectionOverlay();
    if (this.controlsRoot) {
      this.controlsRoot.dataset.visible = "false";
    }
    this.state = {
      ...this.state,
      isActive: false,
      isPaused: true,
      currentIndex: 0,
      totalBars: 0,
    };
    this.renderControls();
  }

  private togglePlayPause() {
    if (!this.state.isActive) return;
    this.state.isPaused = !this.state.isPaused;
    if (this.state.isPaused) {
      this.clearTimer();
    } else {
      this.startTimer();
    }
    this.renderControls();
  }

  private stepForward() {
    if (!this.state.isActive) return;
    this.state.isPaused = true;
    this.clearTimer();
    this.pushNextBar();
    this.renderControls();
  }

  private stepBackward() {
    if (!this.state.isActive || this.state.currentIndex <= MIN_VISIBLE_BARS) return;
    this.state.isPaused = true;
    this.clearTimer();
    this.state.currentIndex -= 1;
    try {
      this.replayWidget?.activeChart().resetData();
    } catch {
      // Ignore reset errors from library edge cases.
    }
    this.renderControls();
  }

  private jumpToPercent(percent: number) {
    if (!this.state.isActive) return;
    const newIndex = Math.max(MIN_VISIBLE_BARS, Math.min(this.state.totalBars, Math.floor((this.state.totalBars * percent) / 100)));
    this.state.currentIndex = newIndex;
    try {
      this.replayWidget?.activeChart().resetData();
    } catch {
      // Ignore reset errors from library edge cases.
    }
    this.renderControls();
  }

  private setSpeed(index: number) {
    if (index < 0 || index >= SPEEDS.length) return;
    this.state.speedIndex = index;
    if (this.state.isActive && !this.state.isPaused) {
      this.clearTimer();
      this.startTimer();
    }
    this.renderControls();
  }

  private startTimer() {
    this.clearTimer();
    this.replayTimer = window.setInterval(() => {
      this.pushNextBar();
    }, SPEEDS[this.state.speedIndex].intervalMs);
  }

  private clearTimer() {
    if (this.replayTimer !== null) {
      window.clearInterval(this.replayTimer);
      this.replayTimer = null;
    }
  }

  private pushNextBar() {
    if (this.state.currentIndex >= this.allBars.length) {
      this.state.isPaused = true;
      this.clearTimer();
      this.renderControls();
      return;
    }

    this.state.currentIndex += 1;
    const bar = this.allBars[this.state.currentIndex - 1];
    if (bar && this.replayRealtimeCallback) {
      this.replayRealtimeCallback(bar);
    }
    this.renderControls();
  }

  private async createReplayWidget(chartType: "candles" | "bars" | "line") {
    const existing = document.getElementById("tv-replay-container");
    existing?.remove();

    const mainChartFrame = document.querySelector<HTMLElement>(".chart-frame");
    if (!mainChartFrame) {
      throw new Error("Replay container host not found");
    }

    const container = document.createElement("div");
    container.id = "tv-replay-container";
    container.className = "chart-frame replay-frame";
    mainChartFrame.parentElement?.appendChild(container);
    this.replayContainer = container;

    const replayDatafeed = this.createReplayDatafeed();
    const mainChartLayout = await this.captureMainChartLayout();

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        void this.initializeReplayWidgetUi(chartType, mainChartLayout).finally(resolve);
      };

      this.replayWidget = new window.TradingView!.widget({
        symbol: this.replaySymbol,
        datafeed: replayDatafeed,
        interval: this.replayResolution,
        container: "tv-replay-container",
        library_path: "/charting_library/",
        locale: "en",
        timezone: "Asia/Ho_Chi_Minh",
        autosize: true,
        theme: "dark",
        preset: window.matchMedia("(max-width: 1024px)").matches ? "mobile" : undefined,
        load_last_chart: false,
        custom_css_url: "/charting_library/custom.css",
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
        custom_indicators_getter: this.options.getCustomIndicators,
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

      this.replayWidget.onChartReady(() => {
        finish();
      });

      window.setTimeout(() => {
        finish();
      }, 4000);
    });
  }

  private createReplayDatafeed() {
    return {
      onReady: (callback: (config: {
        supported_resolutions: string[];
        exchanges: never[];
        symbols_types: never[];
        supports_marks: boolean;
        supports_timescale_marks: boolean;
        supports_time: boolean;
      }) => void) => {
        window.setTimeout(() => callback({
          supported_resolutions: ["1", "5", "15", "30", "60", "240", "1D", "1W", "1M"],
          exchanges: [],
          symbols_types: [],
          supports_marks: false,
          supports_timescale_marks: false,
          supports_time: true,
        }), 0);
      },
      searchSymbols: (_input: string, _exchange: string, _type: string, callback: (symbols: never[]) => void) => callback([]),
      resolveSymbol: (_symbolName: string, onResolve: (info: LibrarySymbolInfo) => void) => {
        window.setTimeout(() => {
          if (!this.replaySymbolInfo) return;
          onResolve(this.replaySymbolInfo);
        }, 0);
      },
      getBars: (
        _symbolInfo: LibrarySymbolInfo,
        _resolution: string,
        _periodParams: { from: number; to: number; firstDataRequest: boolean },
        onHistoryCallback: (bars: Bar[], meta: HistoryMetadata) => void,
      ) => {
        void this.serveReplayBars(
          _symbolInfo,
          _resolution as ResolutionString,
          _periodParams,
          onHistoryCallback,
        );
      },
      subscribeBars: (
        _symbolInfo: LibrarySymbolInfo,
        _resolution: string,
        onRealtimeCallback: (bar: Bar) => void,
      ) => {
        this.replayRealtimeCallback = onRealtimeCallback;
      },
      unsubscribeBars: () => {
        this.replayRealtimeCallback = null;
      },
    };
  }

  private async serveReplayBars(
    symbolInfo: LibrarySymbolInfo,
    resolution: ResolutionString,
    periodParams: { from: number; to: number; firstDataRequest: boolean },
    onHistoryCallback: (bars: Bar[], meta: HistoryMetadata) => void,
  ) {
    const fromMs = periodParams.from * 1000;
    const toMs = periodParams.to * 1000;

    let loadedBars = this.allBars.slice(0, this.state.currentIndex);
    const earliestLoadedBar = loadedBars[0];

    if (earliestLoadedBar && fromMs < earliestLoadedBar.time) {
      await this.backfillReplayBars(symbolInfo, resolution, periodParams.from, Math.floor((earliestLoadedBar.time - 1) / 1000));
      loadedBars = this.allBars.slice(0, this.state.currentIndex);
    }

    const visibleBars = loadedBars.filter((bar) => bar.time >= fromMs && bar.time <= toMs);
    if (visibleBars.length > 0) {
      onHistoryCallback(visibleBars, { noData: false });
      return;
    }

    const earliestVisibleBar = loadedBars[0];
    if (!earliestVisibleBar || toMs < earliestVisibleBar.time) {
      onHistoryCallback([], { noData: true });
      return;
    }

    onHistoryCallback([], {
      noData: true,
      nextTime: earliestVisibleBar.time,
    });
  }

  private captureMainChartStudyTemplate() {
    const chart = this.options.getMainWidget()?.activeChart() as {
      getStudyTemplateSnapshot?: () => unknown;
    } | undefined;

    try {
      return chart?.getStudyTemplateSnapshot?.() ?? null;
    } catch {
      return null;
    }
  }

  private applyReplayStudyTemplate(snapshot: unknown) {
    if (!snapshot) return;

    const replayChart = this.replayWidget?.activeChart() as {
      applyStudyTemplateByRecord?: (record: unknown) => void;
    } | undefined;

    try {
      replayChart?.applyStudyTemplateByRecord?.(snapshot);
    } catch (error) {
      console.error("[Replay] Failed to apply study template:", error);
    }
  }

  private captureMainChartLayout(): Promise<unknown | null> {
    const widget = this.options.getMainWidget() as {
      save?: (cb: (data: unknown) => void) => void;
    } | null;

    return new Promise((resolve) => {
      try {
        widget?.save?.((data) => resolve(data ?? null));
      } catch {
        resolve(null);
      }
      window.setTimeout(() => resolve(null), 1500);
    });
  }

  private async initializeReplayWidgetUi(chartType: "candles" | "bars" | "line", mainChartLayout: unknown) {
    await this.replayWidget?.headerReady().catch(() => undefined);
    this.replayHeaderButton?.remove();
    if (this.replayWidget) {
      this.replayHeaderButton = this.createReplayToggleButton(this.replayWidget);
    }
    await this.applyReplayLayout(mainChartLayout);
    try {
      this.replayWidget?.activeChart().setChartType(mapChartType(chartType));
    } catch {
      // Ignore if chart is still warming up.
    }
  }

  private applyReplayLayout(layout: unknown): Promise<void> {
    const widget = this.replayWidget as {
      load?: (data: unknown, cb?: () => void) => void | Promise<void>;
    } | null;

    const load = widget?.load;
    if (!layout || !load) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      try {
        const maybePromise = load.call(widget, layout, finish);
        if (maybePromise && typeof (maybePromise as Promise<void>).then === "function") {
          (maybePromise as Promise<void>).then(finish).catch(finish);
        }
      } catch {
        finish();
      }

      window.setTimeout(finish, 1500);
    });
  }

  private createReplayToggleButton(widget: ChartingLibraryWidget) {
    const button = widget.createButton({ align: "right" });
    button.innerHTML = replaySvg();
    button.title = "Replay";
    button.setAttribute("aria-label", "Replay");
    button.style.cssText = [
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "width:30px",
      "height:28px",
      "padding:0",
      "border-radius:6px",
      "color:#f59e0b",
    ].join(";");
    button.addEventListener("click", () => {
      if (this.selecting) {
        this.closeSelectionOverlay();
        return;
      }
      if (this.state.isActive) {
        this.toggleControls();
        return;
      }
      void this.openSelectionMode();
    });
    return button;
  }

  private async resolveSymbol(symbol: string) {
    const registry = getDatasourceRegistry();
    await registry.initialize();
    const adapter = this.getAdapter(registry, symbol);
    return adapter.resolveSymbol(symbol);
  }

  private async fetchPreviewBars(symbol: string, resolution: ResolutionString) {
    const now = Math.floor(Date.now() / 1000);
    const previewFrom = now - resolutionToSeconds(resolution) * PREVIEW_BARS;
    return this.fetchBarsRange(symbol, resolution, previewFrom, now);
  }

  private async preloadReplayDataset(symbol: string, resolution: ResolutionString, selectedTimeMs: number): Promise<ReplayCacheEntry> {
    const cacheKey = `${symbol}|${resolution}|${selectedTimeMs}`;
    const cached = this.replayCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const resolutionSeconds = resolutionToSeconds(resolution);
    const now = Math.floor(Date.now() / 1000);
    const selectionSeconds = Math.floor(selectedTimeMs / 1000);
    const preloadFrom = Math.max(0, selectionSeconds - resolutionSeconds * CONTEXT_BARS);
    const bars = await this.fetchBarsRange(symbol, resolution, preloadFrom, now);

    const startIndex = Math.max(
      MIN_VISIBLE_BARS,
      bars.findIndex((bar) => bar.time >= selectedTimeMs),
    );

    const entry = {
      bars,
      selectedTime: selectedTimeMs,
      startIndex: startIndex === -1 ? Math.max(MIN_VISIBLE_BARS, bars.length - 1) : startIndex,
    };

    this.replayCache.set(cacheKey, entry);
    return entry;
  }

  private async fetchBarsRange(symbol: string, resolution: ResolutionString, fromSec: number, toSec: number) {
    const symbolInfo = await this.resolveSymbol(symbol);
    return this.fetchBarsRangeForSymbolInfo(symbolInfo, resolution, fromSec, toSec);
  }

  private async fetchBarsRangeForSymbolInfo(symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, fromSec: number, toSec: number) {
    const registry = getDatasourceRegistry();
    const adapter = this.getAdapter(registry, symbolInfo.full_name);
    const resolutionSeconds = resolutionToSeconds(resolution);
    const requestSpan = resolutionSeconds * MAX_BARS_PER_REQUEST;
    const allBars = new Map<number, Bar>();

    for (let cursor = fromSec; cursor < toSec; cursor += requestSpan) {
      const chunkTo = Math.min(toSec, cursor + requestSpan);
      const response = await adapter.getBars(symbolInfo, resolution, {
        from: cursor,
        to: chunkTo,
        firstDataRequest: cursor === fromSec,
      });

      response.bars.forEach((bar) => {
        allBars.set(bar.time, bar);
      });
    }

    return [...allBars.values()].sort((a, b) => a.time - b.time);
  }

  private async backfillReplayBars(symbolInfo: LibrarySymbolInfo, resolution: ResolutionString, fromSec: number, toSec: number) {
    if (toSec <= fromSec) return;

    const previousFirstBarTime = this.allBars[0]?.time;
    const fetchedBars = await this.fetchBarsRangeForSymbolInfo(symbolInfo, resolution, fromSec, toSec);
    if (fetchedBars.length === 0) return;

    const merged = new Map<number, Bar>();
    fetchedBars.forEach((bar) => merged.set(bar.time, bar));
    this.allBars.forEach((bar) => merged.set(bar.time, bar));

    const sortedBars = [...merged.values()].sort((a, b) => a.time - b.time);
    let prependedCount = 0;
    if (typeof previousFirstBarTime === "number") {
      prependedCount = sortedBars.findIndex((bar) => bar.time === previousFirstBarTime);
      if (prependedCount < 0) {
        prependedCount = 0;
      }
    }

    this.allBars = sortedBars;
    if (prependedCount > 0) {
      this.state.currentIndex += prependedCount;
      this.state.totalBars = this.allBars.length;
    }
  }

  private getAdapter(registry: ReturnType<typeof getDatasourceRegistry>, symbol: string): DatasourceAdapter {
    const [datasourceId] = symbol.split(":");
    const adapter = registry.getAdapter(datasourceId);
    if (!adapter) {
      throw new Error(`No adapter for ${symbol}`);
    }
    return adapter;
  }

  private bindVisibleRangeUpdates() {
    const chart = this.options.getMainWidget()?.activeChart() as {
      onVisibleRangeChanged?: () => {
        subscribe: (context: null, handler: () => void) => void;
        unsubscribeAll?: () => void;
      };
    } | undefined;

    this.visibleRangeSubscription?.unsubscribeAll?.();
    this.visibleRangeSubscription = null;

    const observable = chart?.onVisibleRangeChanged?.();
    if (!observable) return;

    observable.subscribe(null, () => {
      if (!this.selecting) return;
      this.scheduleSelectionRefresh();
    });

    this.visibleRangeSubscription = observable;
  }

  private scheduleSelectionRefresh() {
    if (this.selectionRefreshFrame !== null) return;

    this.selectionRefreshFrame = window.requestAnimationFrame(() => {
      this.selectionRefreshFrame = null;
      this.updateSelectionFromCoordinate();
      this.renderSelectionOverlay();
    });
  }

  private updateSelectionFromCoordinate() {
    const state = this.selectionState;
    if (!state) return;

    const selectedIndex = this.findClosestBarIndex(state.bars, this.coordinateToBarTime(state.markerCoordinate));
    this.selectionState = {
      ...state,
      selectedIndex,
    };
  }

  private coordinateToBarTime(coordinate: number) {
    const chart = this.options.getMainWidget()?.activeChart() as {
      getTimeScale?: () => { coordinateToTime: (coord: number) => number | null };
      getVisibleRange?: () => { from: number; to: number } | null;
    } | undefined;
    const timeScale = chart?.getTimeScale?.();
    const time = timeScale?.coordinateToTime(coordinate);
    if (typeof time === "number") {
      return time * 1000;
    }

    const metrics = this.getSelectionPaneMetrics();
    const visibleRange = chart?.getVisibleRange?.();
    if (!metrics || !visibleRange || metrics.width <= 0) {
      return 0;
    }

    const ratio = Math.max(0, Math.min(1, coordinate / metrics.width));
    return (visibleRange.from + (visibleRange.to - visibleRange.from) * ratio) * 1000;
  }

  private getInitialMarkerCoordinate() {
    const metrics = this.getSelectionPaneMetrics();
    return metrics ? metrics.width * 0.65 : 0;
  }

  private getSelectionPaneMetrics() {
    const widget = this.options.getMainWidget() as (ChartingLibraryWidget & {
      _innerWindow?: () => Window;
      _iFrame?: HTMLIFrameElement;
    }) | null;

    const iframe = widget?._iFrame;
    const innerWindow = widget?._innerWindow?.();
    if (!iframe || !innerWindow) return null;

    const pane = innerWindow.document.querySelector<HTMLElement>(".chart-markup-table.pane");
    if (!pane) return null;

    const paneRect = pane.getBoundingClientRect();
    const iframeRect = iframe.getBoundingClientRect();

    return {
      left: iframeRect.left + paneRect.left,
      top: iframeRect.top + paneRect.top,
      width: paneRect.width,
      height: paneRect.height,
    };
  }

  private findClosestBarIndex(bars: Bar[], targetTime: number) {
    if (bars.length === 0) return 0;
    if (targetTime <= bars[0].time) return 0;
    if (targetTime >= bars[bars.length - 1].time) return bars.length - 1;

    let low = 0;
    let high = bars.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const barTime = bars[mid].time;
      if (barTime === targetTime) return mid;
      if (barTime < targetTime) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const prev = bars[Math.max(0, high)];
    const next = bars[Math.min(bars.length - 1, low)];
    return Math.abs(next.time - targetTime) < Math.abs(targetTime - prev.time)
      ? Math.min(bars.length - 1, low)
      : Math.max(0, high);
  }

  private setSelectionCursorMode(enabled: boolean) {
    const widget = this.options.getMainWidget() as (ChartingLibraryWidget & {
      _iFrame?: HTMLIFrameElement;
    }) | null;
    const frame = widget?._iFrame;
    const cursor = this.selectionRoot?.querySelector<HTMLElement>('[data-role="cursor"]');
    if (!frame) return;

    if (enabled) {
      this.mainFrameCursor = frame.style.cursor;
      frame.style.cursor = "default";
      if (cursor) {
        cursor.dataset.visible = "true";
      }
    } else {
      frame.style.cursor = this.mainFrameCursor;
      this.mainFrameCursor = "";
      if (cursor) {
        cursor.dataset.visible = "false";
      }
    }
  }

  private updateSelectionCursor(clientX?: number, clientY?: number) {
    if (!this.selecting || !this.selectionRoot || !this.selectionState) return;

    const cursor = this.selectionRoot.querySelector<HTMLElement>('[data-role="cursor"]');
    const metrics = this.getSelectionPaneMetrics();
    const widget = this.options.getMainWidget() as (ChartingLibraryWidget & {
      _iFrame?: HTMLIFrameElement;
    }) | null;
    const frame = widget?._iFrame;

    if (!cursor || !metrics || !frame) return;

    const lineX = metrics.left + this.selectionState.markerCoordinate;
    const defaultY = this.selectionState.cursorY || metrics.top + metrics.height / 2;
    const resolvedY = typeof clientY === "number" ? clientY : defaultY;
    const inPaneY = resolvedY >= metrics.top && resolvedY <= metrics.top + metrics.height;
    const pointerOnRight = typeof clientX !== "number" || clientX >= lineX;

    if (pointerOnRight && inPaneY) {
      this.selectionState = {
        ...this.selectionState,
        cursorY: resolvedY,
      };
    }

    const clampedY = Math.max(
      metrics.top + 18,
      Math.min(metrics.top + metrics.height - 18, this.selectionState.cursorY || defaultY),
    );
    frame.style.cursor = pointerOnRight && inPaneY ? "none" : "default";
    cursor.dataset.visible = "true";
    cursor.style.left = `${lineX}px`;
    cursor.style.top = `${clampedY}px`;
  }

  private scheduleSelectionCursorUpdate(clientX?: number, clientY?: number) {
    this.pendingCursorPoint = { clientX, clientY };
    if (this.selectionCursorFrame !== null) return;

    this.selectionCursorFrame = window.requestAnimationFrame(() => {
      this.selectionCursorFrame = null;
      const point = this.pendingCursorPoint;
      this.pendingCursorPoint = null;
      this.updateSelectionCursor(point?.clientX, point?.clientY);
    });
  }

  private formatStampTime(timestamp: number) {
    return new Date(timestamp).toLocaleString("en-GB", {
      hour12: false,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private handleKeydown(event: KeyboardEvent) {
    if (this.selecting && event.key === "Escape") {
      event.preventDefault();
      this.closeSelectionOverlay();
      return;
    }

    if (this.selecting && event.key === "Enter") {
      event.preventDefault();
      void this.confirmSelectionAndStartReplay();
      return;
    }

    if (!this.state.isActive) return;
    if (event.target instanceof HTMLInputElement) return;

    switch (event.key) {
      case " ":
        event.preventDefault();
        this.togglePlayPause();
        break;
      case "ArrowRight":
        event.preventDefault();
        this.stepForward();
        break;
      case "ArrowLeft":
        event.preventDefault();
        this.stepBackward();
        break;
      case "ArrowUp":
        event.preventDefault();
        this.setSpeed(Math.min(this.state.speedIndex + 1, SPEEDS.length - 1));
        break;
      case "ArrowDown":
        event.preventDefault();
        this.setSpeed(Math.max(this.state.speedIndex - 1, 0));
        break;
      case "Escape":
        event.preventDefault();
        this.stopReplay();
        break;
    }
  }
}
