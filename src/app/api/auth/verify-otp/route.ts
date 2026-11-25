import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = (body?.email || '').trim().toLowerCase();
    const token = (body?.token || body?.otp || '').trim();
    const type = (body?.type || 'login') as 'login' | 'signup';

    if (!email || !token || token.length !== 6) {
      return NextResponse.json(
        { ok: false, error: 'A valid email and 6-digit verification code are required.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Verify via secure single-use RPC
    const { data: verified, error: rpcErr } = await supabase.rpc('verify_email_otp', {
      target_email: email,
      code: token,
      otp_type: type,
    });

    if (rpcErr) {
      console.error('RPC verify_email_otp error:', rpcErr);
      return NextResponse.json(
        { ok: false, error: 'Failed to verify OTP. Please try again.' },
        { status: 500 }
      );
    }

    if (verified) {
      return NextResponse.json({
        ok: true,
        verified: true,
        message: 'OTP verified successfully.',
      });
    }

    // Secondary fallback check for type ambiguity (login vs signup)
    const altType = type === 'login' ? 'signup' : 'login';
    const { data: altVerified } = await supabase.rpc('verify_email_otp', {
      target_email: email,
      code: token,
      otp_type: altType,
    });

    if (altVerified) {
      return NextResponse.json({
        ok: true,
        verified: true,
        message: 'OTP verified successfully.',
      });
    }

    return NextResponse.json(
      { ok: false, error: 'Invalid or expired verification code. Please check your inbox and try again.' },
      { status: 400 }
    );
  } catch (err: any) {
    console.error('verify-otp API error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal server error while verifying OTP' },
      { status: 500 }
    );
  }
}
