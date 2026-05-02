import { openDB, type DBSchema } from "idb";

type CachedSymbolPayload<T> = {
  key: string;
  timestamp: number;
  symbols: T[];
};

interface SymbolCacheDb extends DBSchema {
  symbolCache: {
    key: string;
    value: CachedSymbolPayload<unknown>;
  };
}

async function getDb() {
  return openDB<SymbolCacheDb>("nexa-symbol-cache-db", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("symbolCache")) {
        db.createObjectStore("symbolCache", { keyPath: "key" });
      }
    },
  });
}

export async function readSymbolCache<T>(key: string, maxAgeMs: number, ignoreAge = false): Promise<T[]> {
  if (typeof window === "undefined") return [];

  try {
    const db = await getDb();
    const payload = (await db.get("symbolCache", key)) as CachedSymbolPayload<T> | undefined;
    if (!payload) return [];
    if (!ignoreAge && Date.now() - payload.timestamp > maxAgeMs) return [];
    return Array.isArray(payload.symbols) ? payload.symbols : [];
  } catch {
    return [];
  }
}

export async function writeSymbolCache<T>(key: string, symbols: T[]) {
  if (typeof window === "undefined") return;

  try {
    const db = await getDb();
    await db.put("symbolCache", {
      key,
      timestamp: Date.now(),
      symbols,
    });
  } catch {
    // Ignore cache write failures and continue without persistence.
  }
}
