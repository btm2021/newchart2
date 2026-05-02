import { neon } from "@neondatabase/serverless";
import type { MarketType } from "@/lib/datasources/types";
import type { Bar } from "@/lib/types/charting";
import type { OhlcvMonitorRecord, OhlcvSymbolUpdate } from "@/lib/monitor/ohlcv-monitor-store";

type DbRecordRow = {
  id: string;
  datasource_id: string;
  exchange: string;
  market_type: MarketType;
  symbol: string;
  display_name: string;
  resolution: string;
  last_updated: number;
  bars: Bar[];
  last_error: string | null;
};

type DbUpdateRow = {
  id: string;
  datasource_id: string;
  symbol: string;
  resolution: string;
  last_updated: number;
  last_error: string | null;
};

let schemaReady: Promise<void> | null = null;

function getConnectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
}

function getSql() {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error("Neon database is not configured. Set DATABASE_URL or POSTGRES_URL in Vercel.");
  }
  return neon(connectionString);
}

function normalizeUnixTimestamp(timestamp: number) {
  return timestamp > 10_000_000_000 ? Math.floor(timestamp / 1000) : timestamp;
}

function getResolutionFromId(id: string) {
  return id.split(":").at(-1) ?? "";
}

function mapRecord(row: DbRecordRow): OhlcvMonitorRecord {
  return {
    id: row.id,
    datasourceId: row.datasource_id,
    exchange: row.exchange,
    marketType: row.market_type,
    symbol: row.symbol,
    displayName: row.display_name,
    lastUpdated: normalizeUnixTimestamp(Number(row.last_updated)),
    bars: row.bars ?? [],
    lastError: row.last_error ?? undefined,
  };
}

function mapUpdate(row: DbUpdateRow): OhlcvSymbolUpdate {
  return {
    id: row.id,
    datasourceId: row.datasource_id,
    symbol: row.symbol,
    resolution: row.resolution,
    lastUpdated: normalizeUnixTimestamp(Number(row.last_updated)),
    lastError: row.last_error ?? undefined,
  };
}

export async function ensureMonitorSchema() {
  if (!schemaReady) {
    const sql = getSql();
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS monitor_ohlcv (
          id TEXT PRIMARY KEY,
          datasource_id TEXT NOT NULL,
          exchange TEXT NOT NULL,
          market_type TEXT NOT NULL,
          symbol TEXT NOT NULL,
          display_name TEXT NOT NULL,
          resolution TEXT NOT NULL,
          last_updated BIGINT NOT NULL,
          bars JSONB NOT NULL,
          last_error TEXT
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS monitor_ohlcv_datasource_idx ON monitor_ohlcv (datasource_id)`;
      await sql`CREATE INDEX IF NOT EXISTS monitor_ohlcv_last_updated_idx ON monitor_ohlcv (last_updated DESC)`;
      await sql`
        CREATE TABLE IF NOT EXISTS monitor_symbol_updates (
          id TEXT PRIMARY KEY,
          datasource_id TEXT NOT NULL,
          symbol TEXT NOT NULL,
          resolution TEXT NOT NULL,
          last_updated BIGINT NOT NULL,
          last_error TEXT
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS monitor_symbol_updates_datasource_idx ON monitor_symbol_updates (datasource_id)`;
      await sql`CREATE INDEX IF NOT EXISTS monitor_symbol_updates_last_updated_idx ON monitor_symbol_updates (last_updated DESC)`;
    })();
  }
  await schemaReady;
}

export async function readNeonRecordsByDatasource(datasourceId: string) {
  await ensureMonitorSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, datasource_id, exchange, market_type, symbol, display_name, resolution, last_updated, bars, last_error
    FROM monitor_ohlcv
    WHERE datasource_id = ${datasourceId}
    ORDER BY symbol ASC
  ` as DbRecordRow[];
  return rows.map(mapRecord);
}

export async function readNeonSymbolUpdates(datasourceId?: string, resolution?: string) {
  await ensureMonitorSchema();
  const sql = getSql();
  const rows = datasourceId && resolution
    ? await sql`
        SELECT id, datasource_id, symbol, resolution, last_updated, last_error
        FROM monitor_symbol_updates
        WHERE datasource_id = ${datasourceId} AND resolution = ${resolution}
        ORDER BY last_updated DESC
      ` as DbUpdateRow[]
    : await sql`
        SELECT id, datasource_id, symbol, resolution, last_updated, last_error
        FROM monitor_symbol_updates
        ORDER BY last_updated DESC
      ` as DbUpdateRow[];
  return rows.map(mapUpdate);
}

export async function writeNeonOhlcvRecord(record: OhlcvMonitorRecord) {
  await ensureMonitorSchema();
  const sql = getSql();
  const lastUpdated = normalizeUnixTimestamp(record.lastUpdated);
  const resolution = getResolutionFromId(record.id);

  await sql.transaction([
    sql`
      INSERT INTO monitor_ohlcv (
        id, datasource_id, exchange, market_type, symbol, display_name, resolution, last_updated, bars, last_error
      ) VALUES (
        ${record.id},
        ${record.datasourceId},
        ${record.exchange},
        ${record.marketType},
        ${record.symbol},
        ${record.displayName},
        ${resolution},
        ${lastUpdated},
        ${JSON.stringify(record.bars)}::jsonb,
        ${record.lastError ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        datasource_id = EXCLUDED.datasource_id,
        exchange = EXCLUDED.exchange,
        market_type = EXCLUDED.market_type,
        symbol = EXCLUDED.symbol,
        display_name = EXCLUDED.display_name,
        resolution = EXCLUDED.resolution,
        last_updated = EXCLUDED.last_updated,
        bars = EXCLUDED.bars,
        last_error = EXCLUDED.last_error
    `,
    sql`
      INSERT INTO monitor_symbol_updates (
        id, datasource_id, symbol, resolution, last_updated, last_error
      ) VALUES (
        ${record.id},
        ${record.datasourceId},
        ${record.symbol},
        ${resolution},
        ${lastUpdated},
        ${record.lastError ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        datasource_id = EXCLUDED.datasource_id,
        symbol = EXCLUDED.symbol,
        resolution = EXCLUDED.resolution,
        last_updated = EXCLUDED.last_updated,
        last_error = EXCLUDED.last_error
    `,
  ]);
}

export async function writeNeonSymbolUpdatesFromRecords(records: OhlcvMonitorRecord[]) {
  await ensureMonitorSchema();
  if (records.length === 0) return;
  const sql = getSql();
  await sql.transaction(records.map((record) => {
    const lastUpdated = normalizeUnixTimestamp(record.lastUpdated);
    const resolution = getResolutionFromId(record.id);
    return sql`
      INSERT INTO monitor_symbol_updates (
        id, datasource_id, symbol, resolution, last_updated, last_error
      ) VALUES (
        ${record.id},
        ${record.datasourceId},
        ${record.symbol},
        ${resolution},
        ${lastUpdated},
        ${record.lastError ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        datasource_id = EXCLUDED.datasource_id,
        symbol = EXCLUDED.symbol,
        resolution = EXCLUDED.resolution,
        last_updated = EXCLUDED.last_updated,
        last_error = EXCLUDED.last_error
    `;
  }));
}

export async function deleteNeonMonitorData(ids: string[]) {
  await ensureMonitorSchema();
  if (ids.length === 0) return;
  const sql = getSql();
  await sql.transaction(ids.flatMap((id) => [
    sql`DELETE FROM monitor_ohlcv WHERE id = ${id}`,
    sql`DELETE FROM monitor_symbol_updates WHERE id = ${id}`,
  ]));
}
