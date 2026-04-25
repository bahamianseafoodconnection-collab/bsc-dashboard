// File: middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/reset-password", "/market"];

export async function middleware(request: NextRequest) {
const { pathname } = request.nextUrl;

// Always allow public paths
const isPublic = PUBLIC_PATHS.some(
(path) => pathname === path || pathname.startsWith(path + "/")
);
if (isPublic) return NextResponse.next();

// Check all cookies for any supabase auth token
const cookies = request.cookies.getAll();
const hasSession = cookies.some(
(cookie) =>
cookie.name.includes("supabase") ||
cookie.name.includes("sb-") ||
cookie.name === "sb-access-token" ||
cookie.name === "sb-refresh-token"
);

if (!hasSession) {
return NextResponse.redirect(new URL("/login", request.url));
}

return NextResponse.next();
}

export const config = {
matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};

