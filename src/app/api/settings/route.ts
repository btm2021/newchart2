import { NextRequest, NextResponse } from "next/server";
import { normalizeAppSettings, type ExchangeEnvStatus } from "@/lib/settings/app-settings";
import { readAppSettings, writeAppSettings } from "@/lib/settings/app-settings-supabase";
import { readRequestSession } from "@/lib/auth/server-session";
import { readExchangeApiKeys, readExchangeEnabled } from "@/lib/accounts/accounts-supabase";

export const runtime = "nodejs";

async function getExchangeEnvStatus(accountId?: string): Promise<ExchangeEnvStatus[]> {
  const apiKeys = accountId ? await readExchangeApiKeys(accountId) : {};
  const enabled = accountId ? await readExchangeEnabled(accountId) : {};
  const exchanges: Omit<ExchangeEnvStatus, "configured" | "enabled">[] = [
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
    enabled: Boolean(enabled[exchange.id]),
    configured: hasRequiredUserKeys(exchange.id, apiKeys[exchange.id]) || exchange.requiredEnv.every((item) => item.configured),
  }));
}

function hasRequiredUserKeys(exchangeId: ExchangeEnvStatus["id"], keys?: Record<string, string>) {
  if (!keys) return false;
  const required = exchangeId === "OKX" ? ["apiKey", "secret", "password"] : ["apiKey", "secret"];
  return required.every((key) => Boolean(keys[key]));
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Settings request failed.";
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    const accountId = readRequestSession(request)?.accountId;
    const settings = await readAppSettings(accountId);
    return NextResponse.json({
      ...settings,
      exchangeEnv: await getExchangeEnvStatus(accountId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await request.json() as { settings?: unknown };
    const accountId = readRequestSession(request)?.accountId;
    const settings = await writeAppSettings(normalizeAppSettings(payload.settings), accountId);
    return NextResponse.json({
      ...settings,
      exchangeEnv: await getExchangeEnvStatus(accountId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
