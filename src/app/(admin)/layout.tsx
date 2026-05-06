import { AdminShell } from "@/components/layout/admin-shell";
import { AUTH_COOKIE_NAME, parseAuthCookieValue } from "@/lib/auth/session-shared";
import { readAccountProfile } from "@/lib/accounts/accounts-supabase";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import React from "react";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const session = parseAuthCookieValue(cookieStore.get(AUTH_COOKIE_NAME)?.value);

  if (!session?.accountId) {
    redirect("/login");
  }

  const profile = await readAccountProfile(session.accountId);
  if (!profile) {
    redirect("/login");
  }

  return <AdminShell>{children}</AdminShell>;
}
