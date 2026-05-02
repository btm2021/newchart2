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

interface OhlcvMonitorDb extends DBSchema {
  ohlcv: {
    key: string;
    value: OhlcvMonitorRecord;
    indexes: {
      datasourceId: string;
      lastUpdated: number;
    };
  };
  symbolUpdates: {
    key: string;
    value: OhlcvSymbolUpdate;
    indexes: {
      datasourceId: string;
      lastUpdated: number;
    };
  };
}

async function getDb() {
  return openDB<OhlcvMonitorDb>("mint-ohlcv-monitor-db", 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("ohlcv")) {
        const store = db.createObjectStore("ohlcv", { keyPath: "id" });
        store.createIndex("datasourceId", "datasourceId");
        store.createIndex("lastUpdated", "lastUpdated");
      }
      if (!db.objectStoreNames.contains("symbolUpdates")) {
        const store = db.createObjectStore("symbolUpdates", { keyPath: "id" });
        store.createIndex("datasourceId", "datasourceId");
        store.createIndex("lastUpdated", "lastUpdated");
      }
    },
  });
}

function normalizeUnixTimestamp(timestamp: number) {
  return timestamp > 10_000_000_000 ? Math.floor(timestamp / 1000) : timestamp;
}

function normalizeRecord(record: OhlcvMonitorRecord): OhlcvMonitorRecord {
  return {
    ...record,
    lastUpdated: normalizeUnixTimestamp(record.lastUpdated),
  };
}

function normalizeUpdate(update: OhlcvSymbolUpdate): OhlcvSymbolUpdate {
  return {
    ...update,
    lastUpdated: normalizeUnixTimestamp(update.lastUpdated),
  };
}

export async function readRecordsByDatasource(datasourceId: string) {
  if (typeof window === "undefined") return [];

  try {
    const db = await getDb();
    const records = await db.getAllFromIndex("ohlcv", "datasourceId", datasourceId);
    return records.map(normalizeRecord);
  } catch {
    return [];
  }
}

export async function readSymbolUpdatesByDatasource(datasourceId: string, resolution: string) {
  if (typeof window === "undefined") return [];

  try {
    const db = await getDb();
    const updates = await db.getAllFromIndex("symbolUpdates", "datasourceId", datasourceId);
    return updates
      .map(normalizeUpdate)
      .filter((update) => update.resolution === resolution);
  } catch {
    return [];
  }
}

export async function readAllSymbolUpdates() {
  if (typeof window === "undefined") return [];

  try {
    const db = await getDb();
    const updates = await db.getAll("symbolUpdates");
    return updates
      .map(normalizeUpdate)
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
  } catch {
    return [];
  }
}

export async function writeSymbolUpdatesFromRecords(records: OhlcvMonitorRecord[]) {
  if (typeof window === "undefined" || records.length === 0) return;

  const db = await getDb();
  const tx = db.transaction("symbolUpdates", "readwrite");
  await Promise.all([
    ...records.map((record) => {
      const normalizedRecord = normalizeRecord(record);
      return tx.objectStore("symbolUpdates").put({
        id: normalizedRecord.id,
        datasourceId: normalizedRecord.datasourceId,
        symbol: normalizedRecord.symbol,
        resolution: normalizedRecord.id.split(":").at(-1) ?? "",
        lastUpdated: normalizedRecord.lastUpdated,
        lastError: normalizedRecord.lastError,
      });
    }),
    tx.done,
  ]);
}

export async function deleteOhlcvMonitorData(ids: string[]) {
  if (typeof window === "undefined" || ids.length === 0) return;

  const db = await getDb();
  const tx = db.transaction(["ohlcv", "symbolUpdates"], "readwrite");
  await Promise.all([
    ...ids.flatMap((id) => [
      tx.objectStore("ohlcv").delete(id),
      tx.objectStore("symbolUpdates").delete(id),
    ]),
    tx.done,
  ]);
}

export async function writeOhlcvRecord(record: OhlcvMonitorRecord) {
  if (typeof window === "undefined") return;

  const db = await getDb();
  const normalizedRecord = normalizeRecord(record);
  const tx = db.transaction(["ohlcv", "symbolUpdates"], "readwrite");
  await Promise.all([
    tx.objectStore("ohlcv").put(normalizedRecord),
    tx.objectStore("symbolUpdates").put({
      id: normalizedRecord.id,
      datasourceId: normalizedRecord.datasourceId,
      symbol: normalizedRecord.symbol,
      resolution: normalizedRecord.id.split(":").at(-1) ?? "",
      lastUpdated: normalizedRecord.lastUpdated,
      lastError: normalizedRecord.lastError,
    }),
    tx.done,
  ]);
}

export async function readRecentOhlcvRecords(limit = 24) {
  if (typeof window === "undefined") return [];

  try {
    const db = await getDb();
    const records = await db.getAllFromIndex("ohlcv", "lastUpdated");
    return records
      .map(normalizeRecord)
      .sort((a, b) => b.lastUpdated - a.lastUpdated)
      .slice(0, limit);
  } catch {
    return [];
  }
}
