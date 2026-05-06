import { AUTH_COOKIE_NAME } from "@/lib/auth/session-shared";
import { createAccount } from "@/lib/accounts/accounts-supabase";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FOREVER_COOKIE_EXPIRY = new Date("9999-12-31T23:59:59.000Z");

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Sign up request failed.";
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      username?: string;
      password?: string;
      displayName?: string;
      email?: string;
      phone?: string;
      address?: string;
    };

    if (!payload.username?.trim() || !payload.password?.trim() || !payload.email?.trim()) {
      return errorResponse(new Error("Username, email and password are required."), 400);
    }

    const user = await createAccount({
      username: payload.username,
      password: payload.password,
      displayName: payload.displayName || payload.username,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
    });

    const response = NextResponse.json({ user });
    response.cookies.set(AUTH_COOKIE_NAME, encodeURIComponent(JSON.stringify(user)), {
      expires: FOREVER_COOKIE_EXPIRY,
      path: "/",
      sameSite: "lax",
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("duplicate key") ? 409 : 500;
    return errorResponse(error, status);
  }
}
