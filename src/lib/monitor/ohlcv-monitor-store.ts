import { openDB, type DBSchema } from "idb";
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

type OhlcvCachePayload = OhlcvMonitorRecord & {
  cachedAt: number;
};

interface OhlcvCacheDb extends DBSchema {
  records: {
    key: string;
    value: OhlcvCachePayload;
    indexes: {
      datasourceId: string;
      lastUpdated: number;
    };
  };
}

async function getLocalDb() {
  return openDB<OhlcvCacheDb>("nexa-monitor-ohlcv-cache", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("records")) {
        const store = db.createObjectStore("records", { keyPath: "id" });
        store.createIndex("datasourceId", "datasourceId");
        store.createIndex("lastUpdated", "lastUpdated");
      }
    },
  });
}

async function readLocalRecordsByDatasource(datasourceId: string): Promise<OhlcvMonitorRecord[]> {
  if (typeof window === "undefined") return [];

  try {
    const db = await getLocalDb();
    const records = await db.getAllFromIndex("records", "datasourceId", datasourceId);
    return records
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map((record) => {
        const payload: OhlcvMonitorRecord = {
          id: record.id,
          datasourceId: record.datasourceId,
          exchange: record.exchange,
          marketType: record.marketType,
          symbol: record.symbol,
          displayName: record.displayName,
          lastUpdated: record.lastUpdated,
          bars: record.bars,
        };
        if (record.lastError) {
          payload.lastError = record.lastError;
        }
        return payload;
      });
  } catch {
    return [];
  }
}

async function writeLocalOhlcvRecords(records: OhlcvMonitorRecord[]) {
  if (typeof window === "undefined" || records.length === 0) return;

  try {
    const db = await getLocalDb();
    const tx = db.transaction("records", "readwrite");
    const cachedAt = Date.now();
    await Promise.all(records.map((record) => tx.store.put({ ...record, cachedAt })));
    await tx.done;
  } catch {
    // Ignore local cache write failures.
  }
}

async function deleteLocalOhlcvRecords(ids: string[]) {
  if (typeof window === "undefined" || ids.length === 0) return;

  try {
    const db = await getLocalDb();
    const tx = db.transaction("records", "readwrite");
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
  } catch {
    // Ignore local cache delete failures.
  }
}

export async function readRecordsByDatasource(datasourceId: string) {
  return readLocalRecordsByDatasource(datasourceId);
}

export async function readSymbolUpdatesByDatasource(datasourceId: string, resolution: string) {
  const records = await readLocalRecordsByDatasource(datasourceId);
  return records
    .filter((record) => record.id.endsWith(`:${resolution}`))
    .map((record) => ({
      id: record.id,
      datasourceId: record.datasourceId,
      symbol: record.symbol,
      resolution,
      lastUpdated: record.lastUpdated,
      lastError: record.lastError,
    }))
    .sort((a, b) => b.lastUpdated - a.lastUpdated);
}

export async function readAllSymbolUpdates() {
  if (typeof window === "undefined") return [];

  try {
    const db = await getLocalDb();
    const records = await db.getAll("records");
    return records
      .map((record) => ({
        id: record.id,
        datasourceId: record.datasourceId,
        symbol: record.symbol,
        resolution: record.id.split(":").at(-1) ?? "",
        lastUpdated: record.lastUpdated,
        lastError: record.lastError,
      }))
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
  } catch {
    return [];
  }
}

export async function writeSymbolUpdatesFromRecords(records: OhlcvMonitorRecord[]) {
  await writeLocalOhlcvRecords(records);
}

export async function writeOhlcvRecords(records: OhlcvMonitorRecord[]) {
  await writeLocalOhlcvRecords(records);
}

export async function deleteOhlcvMonitorData(ids: string[]) {
  await deleteLocalOhlcvRecords(ids);
}

export async function writeOhlcvRecord(record: OhlcvMonitorRecord) {
  await writeLocalOhlcvRecords([record]);
}

export async function readRecentOhlcvRecords(limit = 24) {
  const updates = await readAllSymbolUpdates();
  return updates.slice(0, limit);
}
