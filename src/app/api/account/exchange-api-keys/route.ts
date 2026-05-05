import { readRequestSession } from "@/lib/auth/server-session";
import { maskExchangeApiKeys, readExchangeApiKeys, writeExchangeApiKeys } from "@/lib/accounts/accounts-supabase";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Exchange API key request failed.";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const accountId = readRequestSession(request)?.accountId;
    if (!accountId) return errorResponse(new Error("Account session is required."), 401);

    const keys = await readExchangeApiKeys(accountId);
    return NextResponse.json({
      configured: Object.fromEntries(
        Object.entries(keys).map(([exchange, values]) => [
          exchange,
          Object.fromEntries(Object.entries(values).map(([name, value]) => [name, Boolean(value)])),
        ]),
      ),
      masked: maskExchangeApiKeys(keys),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const accountId = readRequestSession(request)?.accountId;
    if (!accountId) return errorResponse(new Error("Account session is required."), 401);

    const payload = await request.json() as { keys?: Record<string, Record<string, string>> };
    const keys = await writeExchangeApiKeys(accountId, payload.keys ?? {});
    return NextResponse.json({
      configured: Object.fromEntries(
        Object.entries(keys).map(([exchange, values]) => [
          exchange,
          Object.fromEntries(Object.entries(values).map(([name, value]) => [name, Boolean(value)])),
        ]),
      ),
      masked: maskExchangeApiKeys(keys),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
