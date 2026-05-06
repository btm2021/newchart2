import { AUTH_COOKIE_NAME } from "@/lib/auth/session-shared";
import { verifyAccountPassword } from "@/lib/accounts/accounts-supabase";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FOREVER_COOKIE_EXPIRY = new Date("9999-12-31T23:59:59.000Z");

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Authentication request failed.";
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as { username?: string; password?: string };
    const username = payload.username?.trim().toLowerCase() ?? "";
    const password = payload.password ?? "";

    if (!username || !password) {
      return errorResponse(new Error("Username and password are required."), 400);
    }

    const account = await verifyAccountPassword(username, password);
    if (!account) {
      return errorResponse(new Error("Invalid username or password."), 401);
    }

    const user = {
      accountId: account.accountId,
      username: account.username,
      displayName: account.displayName,
      email: account.email,
    };
    const response = NextResponse.json({ user });
    response.cookies.set(AUTH_COOKIE_NAME, encodeURIComponent(JSON.stringify(user)), {
      expires: FOREVER_COOKIE_EXPIRY,
      path: "/",
      sameSite: "lax",
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    expires: new Date(0),
    path: "/",
    sameSite: "lax",
  });
  return response;
}
