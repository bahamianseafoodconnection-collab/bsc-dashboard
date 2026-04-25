// File: middleware.ts
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = ["/", "/pos", "/inventory", "/report", "/market", "/bills", "/cash"];

export async function middleware(request: NextRequest) {
const { pathname } = request.nextUrl;

const isProtected = PROTECTED.some(
(path) => pathname === path || pathname.startsWith(path + "/")
);

if (!isProtected) return NextResponse.next();

// Check for supabase session cookie
const token =
request.cookies.get("sb-auqjjrisivhfmpleusyt-auth-token")?.value ||
request.cookies.get("supabase-auth-token")?.value;

if (!token) {
const loginUrl = new URL("/login", request.url);
loginUrl.searchParams.set("from", pathname);
return NextResponse.redirect(loginUrl);
}

return NextResponse.next();
}

export const config = {
matcher: [
"/((?!login|_next/static|_next/image|favicon.ico|reset-password).*)",
],
};

