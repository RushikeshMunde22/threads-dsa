import { NextResponse } from 'next/server';
import { verifySmtp, sendOtpEmail } from '@/lib/email/mailer';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const testRecipient = searchParams.get('to');

  const verification = await verifySmtp();
  if (!verification.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: verification.error,
        smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
        smtp_email: process.env.SMTP_EMAIL || 'munderushikesh66@gmail.com',
      },
      { status: 500 }
    );
  }

  if (testRecipient) {
    const sendResult = await sendOtpEmail({
      to: testRecipient,
      otp: '849201',
      type: 'login',
    });
    return NextResponse.json({
      ok: sendResult.success,
      smtp_status: 'connected',
      test_email_sent_to: testRecipient,
      error: sendResult.error,
    });
  }

  return NextResponse.json({
    ok: true,
    smtp_status: 'connected',
    smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtp_port: process.env.SMTP_PORT || '465',
    smtp_email: process.env.SMTP_EMAIL || 'munderushikesh66@gmail.com',
  });
}
