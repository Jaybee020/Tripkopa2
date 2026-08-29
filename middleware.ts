import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isOperationsDashboard =
    request.nextUrl.pathname.startsWith("/ops/dashboard");
  const isOperationsLogin = request.nextUrl.pathname.startsWith("/ops/login");

  if (!url || !key) {
    if (isOperationsDashboard) {
      return NextResponse.redirect(new URL("/ops/login", request.url));
    }
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // getUser() validates the JWT against Supabase; never trust getSession()
  // alone in middleware.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isOperationsStaff = false;
  if (user && (isOperationsDashboard || isOperationsLogin)) {
    const { data: staff } = await supabase
      .from("staff_profiles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["operations", "operations_staff", "admin"])
      .maybeSingle();
    isOperationsStaff = Boolean(staff);
  }

  if (isOperationsDashboard && (!user || !isOperationsStaff)) {
    return NextResponse.redirect(new URL("/ops/login", request.url));
  }

  if (isOperationsLogin && user && isOperationsStaff) {
    return NextResponse.redirect(new URL("/ops/dashboard", request.url));
  }

  // Protect all customer dashboard and settings routes by default
  const isProtected =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/settings");

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Auth routes (redirect to dashboard if already logged in)
  const isAuthPath =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup");

  if (isAuthPath && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
