import { requireRequestAccountId } from "@/lib/auth/server-session";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type StorageAction =
  | "listCharts"
  | "getChart"
  | "saveChart"
  | "removeChart"
  | "listStudyTemplates"
  | "getStudyTemplate"
  | "saveStudyTemplate"
  | "removeStudyTemplate"
  | "listDrawingTemplates"
  | "getDrawingTemplate"
  | "saveDrawingTemplate"
  | "removeDrawingTemplate";

type StoragePayload = {
  action?: StorageAction;
  id?: string;
  chart?: {
    id?: string;
    name?: string;
    symbol?: string;
    resolution?: string;
    content?: string;
  };
  name?: string;
  content?: string;
  toolName?: string;
  templateName?: string;
};

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Chart storage request failed.";
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const accountId = requireRequestAccountId(request);
    const payload = await request.json() as StoragePayload;
    const action = payload.action;
    const supabase = getSupabaseAdmin();

    if (action === "listCharts") {
      const { data, error } = await supabase
        .from("chart_layouts")
        .select("id,name,symbol,resolution,timestamp")
        .eq("account_id", accountId)
        .order("timestamp", { ascending: false });
      if (error) throw new Error(error.message);
      return NextResponse.json({ charts: data ?? [] });
    }

    if (action === "getChart") {
      const { data, error } = await supabase
        .from("chart_layouts")
        .select("id,name,symbol,resolution,content,timestamp")
        .eq("account_id", accountId)
        .eq("id", payload.id ?? "")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return NextResponse.json({ chart: data ?? null });
    }

    if (action === "saveChart") {
      const chart = payload.chart;
      if (!chart) return errorResponse(new Error("chart is required."), 400);
      const id = chart.id || `layout_${Date.now()}`;
      const timestamp = Date.now();
      const { error } = await supabase
        .from("chart_layouts")
        .upsert({
          account_id: accountId,
          id,
          name: chart.name ?? "",
          symbol: chart.symbol ?? "",
          resolution: chart.resolution ?? "",
          content: chart.content ?? "",
          timestamp,
          updated_at: new Date().toISOString(),
        }, { onConflict: "account_id,id" });
      if (error) throw new Error(error.message);
      return NextResponse.json({ id });
    }

    if (action === "removeChart") {
      const { error } = await supabase
        .from("chart_layouts")
        .delete()
        .eq("account_id", accountId)
        .eq("id", payload.id ?? "");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "listStudyTemplates") {
      const { data, error } = await supabase
        .from("chart_study_templates")
        .select("name")
        .eq("account_id", accountId)
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return NextResponse.json({ templates: data ?? [] });
    }

    if (action === "getStudyTemplate") {
      const { data, error } = await supabase
        .from("chart_study_templates")
        .select("content")
        .eq("account_id", accountId)
        .eq("name", payload.name ?? "")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return NextResponse.json({ content: data?.content ?? null });
    }

    if (action === "saveStudyTemplate") {
      const name = payload.name ?? "";
      const timestamp = Date.now();
      const { error } = await supabase
        .from("chart_study_templates")
        .upsert({
          account_id: accountId,
          name,
          content: payload.content ?? "",
          timestamp,
          updated_at: new Date().toISOString(),
        }, { onConflict: "account_id,name" });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "removeStudyTemplate") {
      const { error } = await supabase
        .from("chart_study_templates")
        .delete()
        .eq("account_id", accountId)
        .eq("name", payload.name ?? "");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "listDrawingTemplates") {
      const { data, error } = await supabase
        .from("chart_drawing_templates")
        .select("name")
        .eq("account_id", accountId)
        .eq("tool_name", payload.toolName ?? "")
        .order("name", { ascending: true });
      if (error) throw new Error(error.message);
      return NextResponse.json({ templates: data ?? [] });
    }

    if (action === "getDrawingTemplate") {
      const { data, error } = await supabase
        .from("chart_drawing_templates")
        .select("content")
        .eq("account_id", accountId)
        .eq("tool_name", payload.toolName ?? "")
        .eq("name", payload.templateName ?? "")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return NextResponse.json({ content: data?.content ?? null });
    }

    if (action === "saveDrawingTemplate") {
      const timestamp = Date.now();
      const { error } = await supabase
        .from("chart_drawing_templates")
        .upsert({
          account_id: accountId,
          tool_name: payload.toolName ?? "",
          name: payload.templateName ?? "",
          content: payload.content ?? "",
          timestamp,
          updated_at: new Date().toISOString(),
        }, { onConflict: "account_id,tool_name,name" });
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "removeDrawingTemplate") {
      const { error } = await supabase
        .from("chart_drawing_templates")
        .delete()
        .eq("account_id", accountId)
        .eq("tool_name", payload.toolName ?? "")
        .eq("name", payload.templateName ?? "");
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return errorResponse(new Error("Unsupported chart storage action."), 400);
  } catch (error) {
    return errorResponse(error);
  }
}
