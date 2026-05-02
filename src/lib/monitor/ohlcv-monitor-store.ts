import type { MarketType } from "@/lib/datasources/types";
import type { Bar } from "@/lib/types/charting";

export type OhlcvMonitorRecord = {
  id: string;
  datasourceId: string;
  exchange: string;
  marketType: MarketType;
  symbol: string;
  displayName: string;
  lastUpdated: number;
  bars: Bar[];
  lastError?: string;
};

export type OhlcvSymbolUpdate = {
  id: string;
  datasourceId: string;
  symbol: string;
  resolution: string;
  lastUpdated: number;
  lastError?: string;
};

async function requestMonitorApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Monitor database request failed.");
  }

  return response.json() as Promise<T>;
}

export async function readRecordsByDatasource(datasourceId: string) {
  const params = new URLSearchParams({
    type: "records",
    datasourceId,
  });
  const payload = await requestMonitorApi<{ records: OhlcvMonitorRecord[] }>(`/api/monitor/ohlcv?${params.toString()}`);
  return payload.records;
}

export async function readSymbolUpdatesByDatasource(datasourceId: string, resolution: string) {
  const params = new URLSearchParams({
    type: "updates",
    datasourceId,
    resolution,
  });
  const payload = await requestMonitorApi<{ updates: OhlcvSymbolUpdate[] }>(`/api/monitor/ohlcv?${params.toString()}`);
  return payload.updates;
}

export async function readAllSymbolUpdates() {
  const payload = await requestMonitorApi<{ updates: OhlcvSymbolUpdate[] }>("/api/monitor/ohlcv?type=updates");
  return payload.updates;
}

export async function writeSymbolUpdatesFromRecords(records: OhlcvMonitorRecord[]) {
  if (records.length === 0) return;
  await requestMonitorApi<{ ok: true }>("/api/monitor/ohlcv", {
    method: "POST",
    body: JSON.stringify({
      action: "seedUpdates",
      records,
    }),
  });
}

export async function deleteOhlcvMonitorData(ids: string[]) {
  if (ids.length === 0) return;
  await requestMonitorApi<{ ok: true }>("/api/monitor/ohlcv", {
    method: "DELETE",
    body: JSON.stringify({ ids }),
  });
}

export async function writeOhlcvRecord(record: OhlcvMonitorRecord) {
  await requestMonitorApi<{ ok: true }>("/api/monitor/ohlcv", {
    method: "POST",
    body: JSON.stringify({
      action: "writeRecord",
      record,
    }),
  });
}

export async function readRecentOhlcvRecords(limit = 24) {
  const updates = await readAllSymbolUpdates();
  return updates.slice(0, limit);
}
