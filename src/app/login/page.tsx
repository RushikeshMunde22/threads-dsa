'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type AuthMode = 'signin' | 'signup' | 'otp-verify' | 'magic-otp';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpVerifyType, setOtpVerifyType] = useState<'signup' | 'email'>('signup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlErr = params.get('error');
      if (urlErr) {
        if (urlErr === 'oauth_callback_failed' || urlErr === 'oauth_missing_code') {
          setError('Google authentication could not be completed. Please try again.');
        } else {
          setError(decodeURIComponent(urlErr));
        }
      }
    }
  }, []);

  const handleGoogleOAuth = async () => {
    setError(null);
    setLoading(true);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (oauthErr) {
      if (
        oauthErr.message?.toLowerCase().includes('not enabled') ||
        oauthErr.message?.toLowerCase().includes('unsupported provider')
      ) {
        setError(
          'Google Provider is not enabled in your Supabase Dashboard. Turn ON Google under Authentication > Providers in Supabase and paste your Google Client ID & Secret.'
        );
      } else {
        setError(oauthErr.message);
      }
      setLoading(false);
    }
  };

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInErr) {
      setLoading(false);
      setError(signInErr.message);
      return;
    }
    window.location.href = '/';
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const cleanHandle = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim() || cleanHandle,
          preferred_username: cleanHandle || undefined,
        },
      },
    });

    if (signUpErr) {
      setLoading(false);
      setError(signUpErr.message);
      return;
    }

    if (data.session) {
      setLoading(false);
      window.location.href = '/';
      return;
    }

    // Auto-confirm trigger in PostgreSQL confirms email_confirmed_at on insert.
    // Attempt instant password login so user is immediately authenticated:
    const { error: autoSignInErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (!autoSignInErr) {
      setLoading(false);
      window.location.href = '/';
      return;
    }

    // Trigger SMTP verification email as secondary fallback
    try {
      await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          type: 'signup',
          username: cleanHandle,
        }),
      });
    } catch {
      // Continue even if secondary notifier fails
    }

    setLoading(false);
    setOtpVerifyType('signup');
    setNotice('We sent a 6-digit verification code to your email.');
    setMode('otp-verify');
  };

  const handleSendEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      // 1. Attempt Supabase GoTrue OTP
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });

      if (!otpErr) {
        setOtpVerifyType('email');
        setNotice('6-digit login code sent to your email. Check your inbox.');
        setMode('otp-verify');
        return;
      }

      // 2. Fallback to our Gmail SMTP route if Supabase email limit is hit
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), type: 'login' }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(otpErr?.message || json?.error || 'Failed to send verification code.');
        return;
      }

      setOtpVerifyType('email');
      setNotice('6-digit login code sent to your email via SMTP. Check your inbox.');
      setMode('otp-verify');
    } catch (err: any) {
      setError(err?.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1. First attempt Supabase verification
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpToken.trim(),
        type: otpVerifyType,
      });

      if (!verifyErr) {
        window.location.href = '/';
        return;
      }

      // 2. If Supabase returned an error, verify against our SMTP OTP service
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), token: otpToken.trim() }),
      });
      const json = await res.json();

      if (json.ok && json.verified) {
        // If user entered password during signup, sign in with password
        if (password) {
          const { error: pwdErr } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (!pwdErr) {
            window.location.href = '/';
            return;
          }
        }
        window.location.href = '/';
        return;
      }

      setError(verifyErr?.message || json.error || 'Invalid verification code');
    } catch (err: any) {
      setError(err?.message || 'Failed to verify code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 bg-threads-bg text-threads-text">
      <div className="w-full max-w-[390px] bg-threads-surface border border-threads-border rounded-3xl p-7 shadow-2xl">
        {/* Threads @ Mark */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-threads-elevated border border-threads-border flex items-center justify-center text-2xl font-bold tracking-tight mb-3">
            @
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            {mode === 'signin' && 'Log in to Threads'}
            {mode === 'signup' && 'Create your Threads account'}
            {mode === 'magic-otp' && 'Sign in with Email OTP'}
            {mode === 'otp-verify' && 'Verify your 6-digit code'}
          </h1>
          <p className="text-xs text-threads-muted mt-1 text-center">
            Powered by Supabase Auth & C++17 DSA Engine
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 px-3.5 py-2.5 text-xs text-red-400">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-2.5 text-xs text-emerald-400">
            {notice}
          </div>
        )}

        {mode === 'signin' && (
          <form onSubmit={handlePasswordSignIn} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-threads-elevated border border-threads-border px-4 py-3 text-sm text-threads-text placeholder:text-threads-muted focus:outline-none focus:border-threads-muted"
            />
            <input
              type="password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl bg-threads-elevated border border-threads-border px-4 py-3 text-sm text-threads-text placeholder:text-threads-muted focus:outline-none focus:border-threads-muted"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-threads-text text-threads-bg font-semibold py-3 text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Log in'}
            </button>
          </form>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3">
            <input
              type="text"
              required
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl bg-threads-elevated border border-threads-border px-4 py-3 text-sm text-threads-text placeholder:text-threads-muted focus:outline-none focus:border-threads-muted"
            />
            <input
              type="text"
              required
              placeholder="@handle (letters, numbers, _ .)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl bg-threads-elevated border border-threads-border px-4 py-3 text-sm text-threads-text placeholder:text-threads-muted focus:outline-none focus:border-threads-muted"
            />
            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-threads-elevated border border-threads-border px-4 py-3 text-sm text-threads-text placeholder:text-threads-muted focus:outline-none focus:border-threads-muted"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl bg-threads-elevated border border-threads-border px-4 py-3 text-sm text-threads-text placeholder:text-threads-muted focus:outline-none focus:border-threads-muted"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-threads-text text-threads-bg font-semibold py-3 text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign up & Send Email OTP'}
            </button>
          </form>
        )}

        {mode === 'magic-otp' && (
          <form onSubmit={handleSendEmailOtp} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-threads-elevated border border-threads-border px-4 py-3 text-sm text-threads-text placeholder:text-threads-muted focus:outline-none focus:border-threads-muted"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-threads-text text-threads-bg font-semibold py-3 text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>
                  <Mail className="w-4 h-4" />
                  Send 6-Digit Email OTP
                </>
              )}
            </button>
          </form>
        )}

        {mode === 'otp-verify' && (
          <form onSubmit={handleVerifyOtp} className="space-y-3">
            <div className="text-xs text-threads-muted text-center">
              Code sent to <span className="text-threads-text font-medium">{email}</span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              placeholder="Enter 6-digit OTP"
              value={otpToken}
              onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-xl bg-threads-elevated border border-threads-border px-4 py-3 text-center text-lg tracking-[0.4em] font-mono text-threads-text placeholder:text-threads-muted placeholder:tracking-normal focus:outline-none focus:border-threads-muted"
            />
            <button
              type="submit"
              disabled={loading || otpToken.length < 6}
              className="w-full rounded-xl bg-threads-text text-threads-bg font-semibold py-3 text-sm hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Verify & Continue
                </>
              )}
            </button>
          </form>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-threads-border" />
          <span className="text-xs text-threads-muted">or</span>
          <div className="flex-1 h-px bg-threads-border" />
        </div>

        {/* Google OAuth Button */}
        <button
          type="button"
          onClick={handleGoogleOAuth}
          disabled={loading}
          className="w-full rounded-xl bg-threads-elevated border border-threads-border px-4 py-3 text-sm font-medium text-threads-text hover:bg-threads-hover transition flex items-center justify-between"
        >
          <span className="flex items-center gap-2.5">
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
              />
              <path
                fill="#34A853"
                d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
              />
              <path
                fill="#EA4335"
                d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
              />
            </svg>
            Continue with Google
          </span>
          <ArrowRight className="w-4 h-4 text-threads-muted" />
        </button>

        {/* Mode Switcher */}
        <div className="mt-5 flex flex-col gap-2 text-center text-xs text-threads-muted">
          {mode !== 'signup' ? (
            <button
              type="button"
              onClick={() => { setError(null); setMode('signup'); }}
              className="hover:text-threads-text transition"
            >
              Need an account? <span className="text-threads-text font-medium">Sign up</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setError(null); setMode('signin'); }}
              className="hover:text-threads-text transition"
            >
              Already have an account? <span className="text-threads-text font-medium">Log in</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => { setError(null); setMode(mode === 'magic-otp' ? 'signin' : 'magic-otp'); }}
            className="inline-flex items-center justify-center gap-1 hover:text-threads-text transition"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {mode === 'magic-otp' ? 'Use password instead' : 'Sign in with 6-digit Email OTP'}
          </button>
        </div>
      </div>

      <Link href="/dsa-lab" className="mt-6 text-xs text-threads-muted hover:text-threads-text transition">
        Explore isolated C++17 DSA Benchmark Lab →
      </Link>
    </div>
  );
}
