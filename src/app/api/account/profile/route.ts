import { readRequestSession } from "@/lib/auth/server-session";
import { readAccountProfile, writeAccountProfile } from "@/lib/accounts/accounts-supabase";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Profile request failed.";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const accountId = readRequestSession(request)?.accountId;
    if (!accountId) return errorResponse(new Error("Account session is required."), 401);

    const profile = await readAccountProfile(accountId);
    if (!profile) return errorResponse(new Error("Account not found."), 404);

    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const accountId = readRequestSession(request)?.accountId;
    if (!accountId) return errorResponse(new Error("Account session is required."), 401);

    const payload = await request.json() as {
      profile?: {
        displayName?: string;
        email?: string;
        phone?: string;
        address?: string;
        password?: string;
        exchangeEnabled?: Record<string, boolean>;
      };
    };

    const profile = await writeAccountProfile(accountId, payload.profile ?? {});
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
