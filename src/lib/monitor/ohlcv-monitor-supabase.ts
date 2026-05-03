import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { MarketType } from "@/lib/datasources/types";
import type { OhlcvMonitorRecord, OhlcvSymbolUpdate } from "@/lib/monitor/ohlcv-monitor-store";
import type { Bar } from "@/lib/types/charting";

type CompactBar = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

type ExchangeUpdateEntry = {
  symbol: string;
  lastUpdated: number;
  lastError?: string | null;
};

type ExchangeUpdates = Record<string, Record<string, ExchangeUpdateEntry>>;

type MonitorDatabase = {
  public: {
    Tables: {
      monitor_ohlcv: {
        Row: {
          id: string;
          datasource_id: string;
          exchange: string;
          market_type: MarketType;
          symbol: string;
          display_name: string;
          resolution: string;
          last_updated: number;
          bars: CompactBar[];
          last_error: string | null;
        };
        Insert: {
          id: string;
          datasource_id: string;
          exchange: string;
          market_type: MarketType;
          symbol: string;
          display_name: string;
          resolution: string;
          last_updated: number;
          bars: CompactBar[];
          last_error?: string | null;
        };
        Update: Partial<MonitorDatabase["public"]["Tables"]["monitor_ohlcv"]["Insert"]>;
      };
      monitor_symbol_updates: {
        Row: {
          id: string;
          datasource_id: string;
          symbol: string;
          resolution: string;
          last_updated: number;
          last_error: string | null;
        };
        Insert: {
          id: string;
          datasource_id: string;
          symbol: string;
          resolution: string;
          last_updated: number;
          last_error?: string | null;
        };
        Update: Partial<MonitorDatabase["public"]["Tables"]["monitor_symbol_updates"]["Insert"]>;
      };
      monitor_exchange_state: {
        Row: {
          datasource_id: string;
          updates: ExchangeUpdates;
          updated_at: number;
        };
        Insert: {
          datasource_id: string;
          updates: ExchangeUpdates;
          updated_at: number;
        };
        Update: Partial<MonitorDatabase["public"]["Tables"]["monitor_exchange_state"]["Insert"]>;
      };
    };
  };
};

let supabase: SupabaseClient | null = null;

function getSupabase() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }

  supabase = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase;
}

function normalizeUnixTimestamp(timestamp: number) {
  return timestamp > 10_000_000_000 ? Math.floor(timestamp / 1000) : timestamp;
}

function getResolutionFromId(id: string) {
  return id.split(":").at(-1) ?? "";
}

function mapRecord(row: MonitorDatabase["public"]["Tables"]["monitor_ohlcv"]["Row"]): OhlcvMonitorRecord {
  return {
    id: row.id,
    datasourceId: row.datasource_id,
    exchange: row.exchange,
    marketType: row.market_type,
    symbol: row.symbol,
    displayName: row.display_name,
    lastUpdated: normalizeUnixTimestamp(Number(row.last_updated)),
    bars: (row.bars ?? []).map(expandBar),
    lastError: row.last_error ?? undefined,
  };
}

function mapUpdate(id: string, datasourceId: string, resolution: string, entry: ExchangeUpdateEntry): OhlcvSymbolUpdate {
  return {
    id,
    datasourceId,
    symbol: entry.symbol,
    resolution,
    lastUpdated: normalizeUnixTimestamp(Number(entry.lastUpdated)),
    lastError: entry.lastError ?? undefined,
  };
}

function toMonitorRow(record: OhlcvMonitorRecord): MonitorDatabase["public"]["Tables"]["monitor_ohlcv"]["Insert"] {
  return {
    id: record.id,
    datasource_id: record.datasourceId,
    exchange: record.exchange,
    market_type: record.marketType,
    symbol: record.symbol,
    display_name: record.displayName,
    resolution: getResolutionFromId(record.id),
    last_updated: normalizeUnixTimestamp(record.lastUpdated),
    bars: record.bars.map(compactBar),
    last_error: record.lastError ?? null,
  };
}

function compactBar(bar: Bar): CompactBar {
  return {
    t: normalizeUnixTimestamp(bar.time),
    o: normalizeNumber(bar.open),
    h: normalizeNumber(bar.high),
    l: normalizeNumber(bar.low),
    c: normalizeNumber(bar.close),
    v: normalizeNumber(bar.volume ?? 0),
  };
}

function expandBar(bar: CompactBar | Bar): Bar {
  if ("t" in bar) {
    return {
      time: normalizeUnixTimestamp(bar.t) * 1000,
      open: normalizeNumber(bar.o),
      high: normalizeNumber(bar.h),
      low: normalizeNumber(bar.l),
      close: normalizeNumber(bar.c),
      volume: normalizeNumber(bar.v ?? 0),
    };
  }

  return {
    time: bar.time,
    open: normalizeNumber(bar.open),
    high: normalizeNumber(bar.high),
    low: normalizeNumber(bar.low),
    close: normalizeNumber(bar.close),
    volume: normalizeNumber(bar.volume ?? 0),
  };
}

function normalizeNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toUpdateEntry(record: OhlcvMonitorRecord): ExchangeUpdateEntry {
  return {
    symbol: record.symbol,
    lastUpdated: normalizeUnixTimestamp(record.lastUpdated),
    lastError: record.lastError ?? null,
  };
}

function getDatasourceIdFromRecordId(id: string) {
  return id.split(":")[0] ?? "";
}

async function readExchangeUpdates(datasourceId: string): Promise<ExchangeUpdates> {
  const { data, error } = await getSupabase()
    .from("monitor_exchange_state")
    .select("updates")
    .eq("datasource_id", datasourceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return ((data as { updates?: ExchangeUpdates } | null)?.updates ?? {}) as ExchangeUpdates;
}

async function writeExchangeUpdates(datasourceId: string, updates: ExchangeUpdates) {
  const { error } = await getSupabase()
    .from("monitor_exchange_state")
    .upsert({
      datasource_id: datasourceId,
      updates,
      updated_at: Math.floor(Date.now() / 1000),
    }, { onConflict: "datasource_id" });

  if (error) throw new Error(error.message);
}

async function mergeExchangeUpdates(records: OhlcvMonitorRecord[]) {
  const recordsByDatasource = new Map<string, OhlcvMonitorRecord[]>();
  records.forEach((record) => {
    recordsByDatasource.set(record.datasourceId, [...(recordsByDatasource.get(record.datasourceId) ?? []), record]);
  });

  for (const [datasourceId, datasourceRecords] of recordsByDatasource.entries()) {
    const updates = await readExchangeUpdates(datasourceId);

    datasourceRecords.forEach((record) => {
      const resolution = getResolutionFromId(record.id);
      updates[resolution] = {
        ...(updates[resolution] ?? {}),
        [record.id]: toUpdateEntry(record),
      };
    });

    await writeExchangeUpdates(datasourceId, updates);
  }
}

export async function readSupabaseRecordsByDatasource(datasourceId: string, options?: { limit?: number; offset?: number }) {
  let query = getSupabase()
    .from("monitor_ohlcv")
    .select("id,datasource_id,exchange,market_type,symbol,display_name,resolution,last_updated,bars,last_error")
    .eq("datasource_id", datasourceId)
    .order("symbol", { ascending: true });

  if (typeof options?.limit === "number") {
    const offset = options.offset ?? 0;
    query = query.range(offset, offset + options.limit - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as MonitorDatabase["public"]["Tables"]["monitor_ohlcv"]["Row"][]).map(mapRecord);
}

export async function readSupabaseSymbolUpdates(datasourceId?: string, resolution?: string) {
  let query = getSupabase()
    .from("monitor_exchange_state")
    .select("datasource_id,updates");

  if (datasourceId) {
    query = query.eq("datasource_id", datasourceId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<{ datasource_id: string; updates: ExchangeUpdates }>)
    .flatMap((state) => Object.entries(state.updates ?? {}).flatMap(([stateResolution, entries]) => {
      if (resolution && stateResolution !== resolution) return [];
      return Object.entries(entries ?? {}).map(([id, entry]) => mapUpdate(id, state.datasource_id, stateResolution, entry));
    }))
    .sort((a, b) => b.lastUpdated - a.lastUpdated);
}

export async function readSupabaseDueSymbolIdsByDatasource(request: {
  datasourceId: string;
  resolution: string;
  symbolIds: string[];
  expireBefore: number;
}) {
  if (request.symbolIds.length === 0) return [];

  const updates = await readExchangeUpdates(request.datasourceId);
  const resolutionUpdates = updates[request.resolution] ?? {};

  return request.symbolIds.filter((id) => {
    const entry = resolutionUpdates[id];
    return !entry || normalizeUnixTimestamp(entry.lastUpdated) <= request.expireBefore;
  });
}

export async function writeSupabaseOhlcvRecord(record: OhlcvMonitorRecord) {
  const client = getSupabase();
  const monitorRow = toMonitorRow(record);

  const monitorResult = await client.from("monitor_ohlcv").upsert(monitorRow, { onConflict: "id" });
  if (monitorResult.error) throw new Error(monitorResult.error.message);

  await mergeExchangeUpdates([record]);
}

export async function writeSupabaseOhlcvRecords(records: OhlcvMonitorRecord[]) {
  if (records.length === 0) return;

  const { error } = await getSupabase()
    .from("monitor_ohlcv")
    .upsert(records.map(toMonitorRow), { onConflict: "id" });

  if (error) throw new Error(error.message);
  await mergeExchangeUpdates(records);
}

export async function writeSupabaseSymbolUpdatesFromRecords(records: OhlcvMonitorRecord[]) {
  if (records.length === 0) return;
  await mergeExchangeUpdates(records);
}

export async function deleteSupabaseMonitorData(ids: string[]) {
  if (ids.length === 0) return;

  const client = getSupabase();
  const monitorResult = await client.from("monitor_ohlcv").delete().in("id", ids);
  if (monitorResult.error) throw new Error(monitorResult.error.message);

  const idsByDatasource = new Map<string, string[]>();
  ids.forEach((id) => {
    const datasourceId = getDatasourceIdFromRecordId(id);
    if (!datasourceId) return;
    idsByDatasource.set(datasourceId, [...(idsByDatasource.get(datasourceId) ?? []), id]);
  });

  for (const [datasourceId, datasourceIds] of idsByDatasource.entries()) {
    const updates = await readExchangeUpdates(datasourceId);
    Object.keys(updates).forEach((resolution) => {
      datasourceIds.forEach((id) => {
        delete updates[resolution]?.[id];
      });
    });
    await writeExchangeUpdates(datasourceId, updates);
  }
}
