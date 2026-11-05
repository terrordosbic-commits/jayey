import { NextResponse } from "next/server";
import { hasDashboardSession } from "@/lib/dashboard-auth";
import { listRecentOrders } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  if (!hasDashboardSession(request)) {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  try {
    const orders = await listRecentOrders();
    return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os pedidos.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
