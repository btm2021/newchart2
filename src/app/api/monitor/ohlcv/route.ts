import {
  deleteSupabaseMonitorData,
  readSupabaseRecordsByDatasource,
  readSupabaseDueSymbolIdsByDatasource,
  readSupabaseSymbolUpdates,
  writeSupabaseOhlcvRecord,
  writeSupabaseOhlcvRecords,
  writeSupabaseSymbolUpdatesFromRecords,
} from "@/lib/monitor/ohlcv-monitor-supabase";
import type { OhlcvMonitorRecord } from "@/lib/monitor/ohlcv-monitor-store";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Monitor database request failed.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get("type") || "updates";
    const datasourceId = searchParams.get("datasourceId") || "";
    const resolution = searchParams.get("resolution") || "";
    const limit = Number(searchParams.get("limit") || "0");
    const offset = Number(searchParams.get("offset") || "0");

    if (type === "records") {
      if (!datasourceId) {
        return NextResponse.json({ error: "datasourceId is required." }, { status: 400 });
      }
      const records = await readSupabaseRecordsByDatasource(datasourceId, {
        limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 250) : undefined,
        offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
      });
      return NextResponse.json({ records });
    }

    const updates = await readSupabaseSymbolUpdates(datasourceId || undefined, resolution || undefined);
    return NextResponse.json({ updates });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      action?: "writeRecord" | "writeRecords" | "seedUpdates" | "readDueSymbols";
      record?: OhlcvMonitorRecord;
      records?: OhlcvMonitorRecord[];
      datasourceId?: string;
      resolution?: string;
      symbolIds?: string[];
      expireBefore?: number;
    };

    if (payload.action === "readDueSymbols") {
      if (!payload.datasourceId || !payload.resolution) {
        return NextResponse.json({ error: "datasourceId and resolution are required." }, { status: 400 });
      }

      const ids = await readSupabaseDueSymbolIdsByDatasource({
        datasourceId: payload.datasourceId,
        resolution: payload.resolution,
        symbolIds: payload.symbolIds ?? [],
        expireBefore: payload.expireBefore ?? 0,
      });
      return NextResponse.json({ ids });
    }

    if (payload.action === "seedUpdates") {
      await writeSupabaseSymbolUpdatesFromRecords(payload.records ?? []);
      return NextResponse.json({ ok: true });
    }

    if (payload.action === "writeRecords") {
      await writeSupabaseOhlcvRecords(payload.records ?? []);
      return NextResponse.json({ ok: true });
    }

    if (!payload.record) {
      return NextResponse.json({ error: "record is required." }, { status: 400 });
    }

    await writeSupabaseOhlcvRecord(payload.record);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = await request.json() as { ids?: string[] };
    await deleteSupabaseMonitorData(payload.ids ?? []);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
