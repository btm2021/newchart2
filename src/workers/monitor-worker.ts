import {
  OhlcvMonitorEngine,
  type MonitorRecordsPatch,
  type MonitorStatusesBySource,
  type MonitorSymbolsBySource,
} from "@/lib/monitor/monitor-engine";
import { defaultMonitorSettings, type MonitorSettings } from "@/lib/monitor/monitor-settings";

type MonitorWorkerCommand = {
  type: "start" | "stop" | "sync";
};

let settings: MonitorSettings = defaultMonitorSettings;
let statuses: MonitorStatusesBySource = {};
let exchangeSymbols: MonitorSymbolsBySource = {};
let records: MonitorRecordsPatch = {};

function postSnapshot() {
  self.postMessage({
    type: "snapshot",
    settings,
    statuses,
    exchangeSymbols,
    records,
  });
}

const engine = new OhlcvMonitorEngine({
  onSettings(nextSettings) {
    settings = nextSettings;
    self.postMessage({ type: "settings", settings: nextSettings });
  },
  onStatuses(nextStatuses) {
    statuses = nextStatuses;
    self.postMessage({ type: "statuses", statuses: nextStatuses });
  },
  onSymbols(nextExchangeSymbols) {
    exchangeSymbols = nextExchangeSymbols;
    self.postMessage({ type: "symbols", exchangeSymbols: nextExchangeSymbols });
  },
  onRecords(nextRecords) {
    records = {
      ...records,
      ...nextRecords,
    };
    self.postMessage({ type: "records", records: nextRecords });
  },
  onError(message) {
    self.postMessage({ type: "error", message });
  },
});

self.addEventListener("message", (event: MessageEvent<MonitorWorkerCommand>) => {
  if (event.data.type === "start") {
    void engine.start();
    return;
  }

  if (event.data.type === "stop") {
    engine.stop();
    return;
  }

  if (event.data.type === "sync") {
    postSnapshot();
  }
});
