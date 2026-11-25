import nodemailer from 'nodemailer';

export interface SendOtpOptions {
  to: string;
  otp: string;
  type?: 'login' | 'signup' | 'magic-link';
  username?: string;
}

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE !== 'false' && (port === 465 || port === 0);
  const user = (process.env.SMTP_EMAIL || process.env.SMTP_USER || '').trim();
  // Strip surrounding quotes if present in .env
  const pass = (process.env.SMTP_PASSWORD || '').replace(/^["']|["']$/g, '').trim();

  if (!user || !pass) {
    throw new Error('SMTP credentials are missing. Please set SMTP_EMAIL and SMTP_PASSWORD in .env.local');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

export async function sendOtpEmail({ to, otp, type = 'login', username }: SendOtpOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = getTransporter();
    const fromAddress = process.env.SMTP_EMAIL || 'munderushikesh66@gmail.com';
    const isSignup = type === 'signup';
    const title = isSignup ? 'Confirm your Threads Account' : 'Your Threads Login Code';
    const actionText = isSignup ? 'verify your new Threads account' : 'sign in to your Threads account';

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0A0A0A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #FFFFFF;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #0A0A0A; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px; background-color: #121212; border: 1px solid #262626; border-radius: 16px; padding: 36px 32px; text-align: center;">
          <!-- Logo / Header -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <div style="display: inline-block; width: 44px; height: 44px; line-height: 44px; border-radius: 50%; background-color: #1E1E1E; color: #FFFFFF; font-size: 24px; font-weight: bold; border: 1px solid #333333;">
                @
              </div>
              <h1 style="color: #FFFFFF; font-size: 22px; font-weight: 700; margin: 16px 0 6px 0; letter-spacing: -0.5px;">Threads</h1>
              <p style="color: #8E8E8E; font-size: 14px; margin: 0;">${isSignup ? 'Welcome to Threads' : 'Security Verification'}</p>
            </td>
          </tr>

          <!-- Message Body -->
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <p style="color: #E0E0E0; font-size: 15px; line-height: 22px; margin: 0 0 12px 0;">
                ${username ? `Hi <strong>@${username}</strong>,` : 'Hello,'}
              </p>
              <p style="color: #A0A0A0; font-size: 14px; line-height: 20px; margin: 0;">
                Use the 6-digit verification code below to ${actionText}. This code will expire in <strong>10 minutes</strong>.
              </p>
            </td>
          </tr>

          <!-- OTP Box -->
          <tr>
            <td align="center" style="padding-bottom: 28px;">
              <div style="background-color: #1A1A1A; border: 1px solid #333333; border-radius: 12px; padding: 18px 24px; display: inline-block; letter-spacing: 8px; font-size: 32px; font-weight: 800; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace; color: #FFFFFF;">
                ${otp}
              </div>
            </td>
          </tr>

          <!-- Expiry Notice -->
          <tr>
            <td align="center" style="padding-bottom: 24px; border-top: 1px solid #222222; padding-top: 20px;">
              <p style="color: #777777; font-size: 12px; line-height: 18px; margin: 0;">
                If you did not request this code, you can safely ignore this email. Someone may have typed your address by mistake.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center">
              <p style="color: #555555; font-size: 11px; margin: 0;">
                &copy; ${new Date().getFullYear()} Threads Clone &bull; C++17 DSA High Performance Engine
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    const info = await transporter.sendMail({
      from: `"Threads" <${fromAddress}>`,
      to,
      subject: `${otp} is your Threads verification code`,
      text: `Your Threads verification code is: ${otp}. It will expire in 10 minutes.`,
      html: htmlContent,
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error sending OTP email:', error);
    return { success: false, error: error?.message || 'Failed to send OTP email' };
  }
}

export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'SMTP verification failed' };
  }
}
