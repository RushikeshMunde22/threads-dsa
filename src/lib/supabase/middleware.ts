import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/activity', '/admin'];

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Instant 204 for service worker or chrome probes
  if (pathname === '/sw.js') {
    return new NextResponse(null, { status: 204 });
  }

  // 2. Never intercept static files, Next internals, api routes, or asset extensions
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/wasm') ||
    pathname === '/favicon.ico' ||
    /\.(css|js|map|ico|svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot)($|\?)/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isPlaceholder =
    !url ||
    !anonKey ||
    url.includes('your-project-ref') ||
    anonKey.includes('your-supabase-anon-key');

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  // If credentials are placeholders and route is protected, redirect to login
  if (isPlaceholder) {
    if (isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return supabaseResponse;
  }

  try {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (user) {
      // Check for blocked status or admin route authority
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, is_blocked')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.is_blocked && pathname !== '/blocked') {
        const blockedUrl = request.nextUrl.clone();
        blockedUrl.pathname = '/blocked';
        return NextResponse.redirect(blockedUrl);
      }

      if (pathname.startsWith('/admin') && !profile?.is_admin) {
        const homeUrl = request.nextUrl.clone();
        homeUrl.pathname = '/';
        return NextResponse.redirect(homeUrl);
      }

      if (pathname === '/login') {
        const homeUrl = request.nextUrl.clone();
        homeUrl.pathname = '/';
        const redirectResponse = NextResponse.redirect(homeUrl);
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectResponse.cookies.set(cookie.name, cookie.value);
        });
        return redirectResponse;
      }
    }
  } catch {
    // If Supabase check fails unexpectedly, allow non-protected routes through
    if (isProtected) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/login';
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return supabaseResponse;
}
