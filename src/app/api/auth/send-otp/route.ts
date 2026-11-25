import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sendOtpEmail } from '@/lib/email/mailer';
import { createClient } from '@/lib/supabase/server';

// In-memory IP/email rate limiter (max 4 attempts per 10 minutes)
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || entry.expiresAt < now) {
    rateLimitMap.set(key, { count: 1, expiresAt: now + 10 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 4) {
    return false;
  }
  entry.count += 1;
  return true;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = (body?.email || '').trim().toLowerCase();
    const type = (body?.type || 'login') as 'login' | 'signup';
    const username = body?.username?.trim();

    if (!email || !email.includes('@') || email.length > 254) {
      return NextResponse.json(
        { ok: false, error: 'A valid email address is required.' },
        { status: 400 }
      );
    }

    // Rate Limiting Guard
    if (!checkRateLimit(`otp:${email}`)) {
      return NextResponse.json(
        { ok: false, error: 'Too many OTP requests. Please wait a few minutes before trying again.' },
        { status: 429 }
      );
    }

    // 1. Generate cryptographically strong 6-digit OTP code
    const otp = crypto.randomInt(100000, 999999).toString();

    // 2. Persist OTP securely via RPC (prevents direct public access to table)
    const supabase = await createClient();
    const { error: rpcErr } = await supabase.rpc('store_email_otp', {
      target_email: email,
      code: otp,
      otp_type: type,
      exp_minutes: 10,
    });

    if (rpcErr) {
      console.error('Failed to store OTP via RPC:', rpcErr);
      return NextResponse.json(
        { ok: false, error: 'Failed to generate security code. Please try again.' },
        { status: 500 }
      );
    }

    // 3. Send email via configured Gmail SMTP
    const mailResult = await sendOtpEmail({
      to: email,
      otp,
      type,
      username,
    });

    if (!mailResult.success) {
      return NextResponse.json(
        { ok: false, error: `Failed to deliver OTP: ${mailResult.error}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Verification code sent to ${email}`,
    });
  } catch (err: any) {
    console.error('send-otp API error:', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal server error while sending OTP' },
      { status: 500 }
    );
  }
}
