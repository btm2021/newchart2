import { NextRequest, NextResponse } from "next/server";
import {
  cancelPaperOrder,
  placePaperOrder,
  readPaperTradingState,
  resetPaperTradingAccount,
} from "@/lib/paper-trading/paper-trading-supabase";
import type { PlacePaperOrderRequest } from "@/lib/paper-trading/paper-trading-types";

export const runtime = "nodejs";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Paper trading request failed.";
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    return NextResponse.json(await readPaperTradingState());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json() as {
      action?: "place-order" | "cancel-order";
      order?: PlacePaperOrderRequest;
      orderId?: string;
    };

    if (payload.action === "cancel-order") {
      if (!payload.orderId) {
        return errorResponse(new Error("orderId is required."), 400);
      }
      return NextResponse.json(await cancelPaperOrder(payload.orderId));
    }

    if (!payload.order) {
      return errorResponse(new Error("order payload is required."), 400);
    }

    return NextResponse.json(await placePaperOrder(payload.order));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    return NextResponse.json(await resetPaperTradingAccount());
  } catch (error) {
    return errorResponse(error);
  }
}
