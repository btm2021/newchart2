import { readFavoriteSymbolIds, writeFavoriteSymbolIds } from "@/lib/accounts/accounts-supabase";
import { readRequestSession } from "@/lib/auth/server-session";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Favorite request failed.";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const accountId = readRequestSession(request)?.accountId;
    if (!accountId) return errorResponse(new Error("Account session is required."), 401);

    const favoriteSymbolIds = await readFavoriteSymbolIds(accountId);
    if (!favoriteSymbolIds) return errorResponse(new Error("Account not found."), 404);

    return NextResponse.json({ favoriteSymbolIds });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const accountId = readRequestSession(request)?.accountId;
    if (!accountId) return errorResponse(new Error("Account session is required."), 401);

    const payload = await request.json() as { favoriteSymbolIds?: unknown };
    const nextIds = Array.isArray(payload.favoriteSymbolIds)
      ? payload.favoriteSymbolIds.filter((item): item is string => typeof item === "string")
      : [];
    const favoriteSymbolIds = await writeFavoriteSymbolIds(accountId, nextIds);
    if (!favoriteSymbolIds) return errorResponse(new Error("Account not found."), 404);

    return NextResponse.json({ favoriteSymbolIds });
  } catch (error) {
    return errorResponse(error);
  }
}
