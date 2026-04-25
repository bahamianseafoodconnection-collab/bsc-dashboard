// File: middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = ["/login", "/market", "/reset-password"];

export async function middleware(request: NextRequest) {
const { pathname } = request.nextUrl;

const isPublic = PUBLIC.some(
(p) => pathname === p || pathname.startsWith(p + "/")
);
if (isPublic) return NextResponse.next();

const response = NextResponse.next();

const supabase = createServerClient(
"https://auqjjrisivhfmpleusyt.supabase.co",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg",
{
cookies: {
getAll() {
return request.cookies.getAll();
},
setAll(cookiesToSet) {
cookiesToSet.forEach(({ name, value, options }) =>
response.cookies.set(name, value, options)
);
},
},
}
);

const { data: { user } } = await supabase.auth.getUser();

if (!user) {
return NextResponse.redirect(new URL("/login", request.url));
}

return response;
}

export const config = {
matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
