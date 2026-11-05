import { NextResponse } from "next/server";
import {
  clearDashboardSessionCookie,
  createDashboardSession,
  dashboardSessionCookie,
  hasDashboardSession,
  isDashboardPasswordConfigured,
  validateDashboardPassword,
} from "@/lib/dashboard-auth";
import { parseJsonBody } from "@/lib/checkout";

function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === "https:";
}

export async function GET(request: Request) {
  if (!isDashboardPasswordConfigured()) {
    return NextResponse.json(
      { error: "Configure uma senha de dashboard com pelo menos 12 caracteres no servidor." },
      { status: 503 },
    );
  }
  return NextResponse.json({ authenticated: hasDashboardSession(request) });
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 4096) {
    return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 });
  }
  if (!isDashboardPasswordConfigured()) {
    return NextResponse.json(
      { error: "Configure DASHBOARD_PASSWORD com pelo menos 12 caracteres no servidor." },
      { status: 503 },
    );
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 4096) {
    return NextResponse.json({ error: "Requisição muito grande." }, { status: 413 });
  }
  const body = parseJsonBody(rawBody);
  if (!body || !validateDashboardPassword(body.password)) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const session = createDashboardSession();
  if (!session) {
    return NextResponse.json(
      { error: "Não foi possível iniciar a sessão do dashboard." },
      { status: 503 },
    );
  }
  const response = NextResponse.json({ authenticated: true });
  response.headers.append(
    "Set-Cookie",
    dashboardSessionCookie(session.value, session.maxAge, isSecureRequest(request)),
  );
  return response;
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ authenticated: false });
  response.headers.append(
    "Set-Cookie",
    clearDashboardSessionCookie(isSecureRequest(request)),
  );
  return response;
}
