import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "jayey_dashboard_session";
const SESSION_SECONDS = 8 * 60 * 60;

function getDashboardPassword() {
  const password = process.env.DASHBOARD_PASSWORD?.trim();
  return password && password.length >= 12 ? password : null;
}

function signature(expiresAt: string, password: string) {
  return createHmac("sha256", password).update(expiresAt).digest("hex");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isDashboardPasswordConfigured() {
  return getDashboardPassword() !== null;
}

export function validateDashboardPassword(candidate: unknown) {
  const password = getDashboardPassword();
  return Boolean(
    password &&
      typeof candidate === "string" &&
      constantTimeEqual(candidate, password),
  );
}

export function createDashboardSession() {
  const password = getDashboardPassword();
  if (!password) return null;
  const expiresAt = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  return {
    value: `${expiresAt}.${signature(expiresAt, password)}`,
    maxAge: SESSION_SECONDS,
  };
}

export function hasDashboardSession(request: Request) {
  const password = getDashboardPassword();
  if (!password) return false;
  const cookieHeader = request.headers.get("cookie") || "";
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!cookie) return false;

  const [expiresAt, providedSignature, ...extra] = cookie.split(".");
  if (
    extra.length ||
    !/^\d{10}$/.test(expiresAt || "") ||
    !/^[a-f0-9]{64}$/.test(providedSignature || "") ||
    Number(expiresAt) <= Math.floor(Date.now() / 1000)
  ) {
    return false;
  }
  return constantTimeEqual(providedSignature, signature(expiresAt, password));
}

export function dashboardSessionCookie(value: string, maxAge: number, secure: boolean) {
  return `${COOKIE_NAME}=${value}; Path=/api/dashboard; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearDashboardSessionCookie(secure: boolean) {
  return `${COOKIE_NAME}=; Path=/api/dashboard; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}
