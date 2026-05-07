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

type ExpireScanPayload = {
  id: string;
  lastScannedAt: number;
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
  expireScans: {
    key: string;
    value: ExpireScanPayload;
  };
}

export function normalizeUnixTimestamp(timestamp: number | undefined) {
  if (!timestamp || !Number.isFinite(timestamp)) return 0;
  return timestamp > 10_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);
}

export function getRecordLastUpdatedUnix(record: Pick<OhlcvMonitorRecord, "lastUpdated" | "bars">) {
  return normalizeUnixTimestamp(record.bars.at(-1)?.time) || normalizeUnixTimestamp(record.lastUpdated);
}

function toMonitorRecord(record: OhlcvCachePayload): OhlcvMonitorRecord {
  const payload: OhlcvMonitorRecord = {
    id: record.id,
    datasourceId: record.datasourceId,
    exchange: record.exchange,
    marketType: record.marketType,
    symbol: record.symbol,
    displayName: record.displayName,
    lastUpdated: getRecordLastUpdatedUnix(record),
    bars: record.bars,
  };
  if (record.lastError) {
    payload.lastError = record.lastError;
  }
  return payload;
}

async function getLocalDb() {
  return openDB<OhlcvCacheDb>("nexa-monitor-ohlcv-cache", 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("records")) {
        const store = db.createObjectStore("records", { keyPath: "id" });
        store.createIndex("datasourceId", "datasourceId");
        store.createIndex("lastUpdated", "lastUpdated");
      }
      if (!db.objectStoreNames.contains("expireScans")) {
        db.createObjectStore("expireScans", { keyPath: "id" });
      }
    },
  });
}

async function readLocalRecordsByDatasource(datasourceId: string): Promise<OhlcvMonitorRecord[]> {
  if (typeof indexedDB === "undefined") return [];

  try {
    const db = await getLocalDb();
    const records = await db.getAllFromIndex("records", "datasourceId", datasourceId);
    return records
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .map(toMonitorRecord);
  } catch {
    return [];
  }
}

async function writeLocalOhlcvRecords(records: OhlcvMonitorRecord[]) {
  if (typeof indexedDB === "undefined" || records.length === 0) return;

  try {
    const db = await getLocalDb();
    const tx = db.transaction("records", "readwrite");
    const cachedAt = Date.now();
    await Promise.all(records.map((record) => tx.store.put({
      ...record,
      lastUpdated: getRecordLastUpdatedUnix(record),
      cachedAt,
    })));
    await tx.done;
  } catch {
    // Ignore local cache write failures.
  }
}

async function deleteLocalOhlcvRecords(ids: string[]) {
  if (typeof indexedDB === "undefined" || ids.length === 0) return;

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

export async function readOhlcvRecordsByIds(ids: string[]) {
  if (typeof indexedDB === "undefined" || ids.length === 0) return [];

  try {
    const db = await getLocalDb();
    const records = await Promise.all(ids.map((id) => db.get("records", id)));
    return records
      .filter((record): record is OhlcvCachePayload => Boolean(record))
      .map(toMonitorRecord);
  } catch {
    return [];
  }
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
  if (typeof indexedDB === "undefined") return [];

  try {
    const db = await getLocalDb();
    const records = await db.getAll("records");
    return records
      .map(toMonitorRecord)
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

export async function readExpireScanTimestamp(scanId: string) {
  if (typeof indexedDB === "undefined") return 0;

  try {
    const db = await getLocalDb();
    const scan = await db.get("expireScans", scanId);
    return normalizeUnixTimestamp(scan?.lastScannedAt);
  } catch {
    return 0;
  }
}

export async function writeExpireScanTimestamp(scanId: string, lastScannedAt: number) {
  if (typeof indexedDB === "undefined") return;

  try {
    const db = await getLocalDb();
    await db.put("expireScans", {
      id: scanId,
      lastScannedAt: normalizeUnixTimestamp(lastScannedAt),
    });
  } catch {
    // Ignore scan timestamp write failures.
  }
}
