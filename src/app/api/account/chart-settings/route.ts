import { readRequestSession } from "@/lib/auth/server-session";
import { readAccountChartSettings, writeAccountChartSettings } from "@/lib/accounts/accounts-supabase";
import { defaultWorkspaceState } from "@/lib/storage/workspace-state";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Chart settings request failed.";
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const accountId = readRequestSession(request)?.accountId;
    if (!accountId) {
      return NextResponse.json({ settings: defaultWorkspaceState });
    }

    return NextResponse.json({
      settings: {
        ...defaultWorkspaceState,
        ...(await readAccountChartSettings(accountId)),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const accountId = readRequestSession(request)?.accountId;
    if (!accountId) {
      return errorResponse(new Error("Account session is required."), 401);
    }

    const payload = await request.json() as { settings?: unknown };
    const settings = {
      ...defaultWorkspaceState,
      ...(typeof payload.settings === "object" && payload.settings !== null ? payload.settings : {}),
    };

    return NextResponse.json({
      settings: await writeAccountChartSettings(accountId, settings),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
