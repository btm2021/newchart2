import { NextRequest, NextResponse } from "next/server";
import { normalizeAppSettings, type ExchangeEnvStatus } from "@/lib/settings/app-settings";
import { readAppSettings, writeAppSettings } from "@/lib/settings/app-settings-supabase";

export const runtime = "nodejs";

function getExchangeEnvStatus(): ExchangeEnvStatus[] {
  const exchanges: Omit<ExchangeEnvStatus, "configured">[] = [
    {
      id: "BINANCE",
      label: "Binance",
      requiredEnv: [
        { name: "BINANCE_API_KEY", configured: Boolean(process.env.BINANCE_API_KEY) },
        { name: "BINANCE_SECRET", configured: Boolean(process.env.BINANCE_SECRET) },
      ],
    },
    {
      id: "OKX",
      label: "OKX",
      requiredEnv: [
        { name: "OKX_API_KEY", configured: Boolean(process.env.OKX_API_KEY) },
        { name: "OKX_SECRET", configured: Boolean(process.env.OKX_SECRET) },
        { name: "OKX_PASSWORD", configured: Boolean(process.env.OKX_PASSWORD) },
      ],
    },
    {
      id: "BYBIT",
      label: "Bybit",
      requiredEnv: [
        { name: "BYBIT_API_KEY", configured: Boolean(process.env.BYBIT_API_KEY) },
        { name: "BYBIT_SECRET", configured: Boolean(process.env.BYBIT_SECRET) },
      ],
    },
  ];

  return exchanges.map((exchange) => ({
    ...exchange,
    configured: exchange.requiredEnv.every((item) => item.configured),
  }));
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Settings request failed.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const settings = await readAppSettings();
    return NextResponse.json({
      ...settings,
      exchangeEnv: getExchangeEnvStatus(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await request.json() as { settings?: unknown };
    const settings = await writeAppSettings(normalizeAppSettings(payload.settings));
    return NextResponse.json({
      ...settings,
      exchangeEnv: getExchangeEnvStatus(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
