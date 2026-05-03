import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const TABLES = [
  {
    name: "monitor_ohlcv",
    label: "OHLCV data",
    description: "Cached compact OHLCV bars used by monitor cards and chart previews.",
  },
  {
    name: "monitor_exchange_state",
    label: "Exchange state",
    description: "One JSON state record per exchange for symbol update timestamps.",
  },
  {
    name: "monitor_symbol_updates",
    label: "Legacy symbol updates",
    description: "Old per-symbol update table kept for compatibility while testing.",
  },
] as const;

type MonitorTableName = (typeof TABLES)[number]["name"];

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }

  return createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isMonitorTableName(value: string): value is MonitorTableName {
  return TABLES.some((table) => table.name === value);
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Supabase table request failed.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const tables = await Promise.all(
      TABLES.map(async (table) => {
        const { count, error } = await supabase
          .from(table.name)
          .select("*", { count: "exact", head: true });

        if (error) throw new Error(error.message);

        return {
          ...table,
          count: count ?? 0,
        };
      }),
    );

    return NextResponse.json({ tables });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const payload = await request.json() as { table?: string };
    const table = payload.table ?? "";

    if (table !== "all" && !isMonitorTableName(table)) {
      return NextResponse.json({ error: "Unsupported table." }, { status: 400 });
    }

    const { error } = await getSupabase().rpc("clean_monitor_table", {
      p_table: table,
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
