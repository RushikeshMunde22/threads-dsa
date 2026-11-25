import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  const response = NextResponse.redirect(`${origin}/login`, { status: 302 });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, {
              ...options,
              maxAge: 0,
              path: '/',
            });
          });
        },
      },
    }
  );

  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.error('Signout error:', err);
  }

  // Explicitly delete any Supabase authentication cookies
  request.cookies.getAll().forEach((c) => {
    if (c.name.startsWith('sb-') || c.name.includes('auth-token') || c.name.includes('supabase')) {
      response.cookies.set(c.name, '', {
        maxAge: 0,
        path: '/',
        expires: new Date(0),
      });
    }
  });

  return response;
}

export async function GET(request: NextRequest) {
  return POST(request);
}
