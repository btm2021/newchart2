import {
  deleteNeonMonitorData,
  readNeonRecordsByDatasource,
  readNeonSymbolUpdates,
  writeNeonOhlcvRecord,
  writeNeonSymbolUpdatesFromRecords,
} from "@/lib/monitor/ohlcv-monitor-neon";
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

    if (type === "records") {
      if (!datasourceId) {
        return NextResponse.json({ error: "datasourceId is required." }, { status: 400 });
      }
      const records = await readNeonRecordsByDatasource(datasourceId);
      return NextResponse.json({ records });
    }

    const updates = await readNeonSymbolUpdates(datasourceId || undefined, resolution || undefined);
    return NextResponse.json({ updates });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      action?: "writeRecord" | "seedUpdates";
      record?: OhlcvMonitorRecord;
      records?: OhlcvMonitorRecord[];
    };

    if (payload.action === "seedUpdates") {
      await writeNeonSymbolUpdatesFromRecords(payload.records ?? []);
      return NextResponse.json({ ok: true });
    }

    if (!payload.record) {
      return NextResponse.json({ error: "record is required." }, { status: 400 });
    }

    await writeNeonOhlcvRecord(payload.record);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = await request.json() as { ids?: string[] };
    await deleteNeonMonitorData(payload.ids ?? []);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
