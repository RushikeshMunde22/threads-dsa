'use client';

import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function BlockedPage() {
  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Continue
    }
    window.location.href = '/api/auth/signout';
  };

  return (
    <div className="min-h-screen bg-threads-bg text-threads-text flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-threads-surface border border-red-500/30 p-8 text-center space-y-5 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-threads-text">
            Account Suspended
          </h1>
          <p className="text-xs sm:text-sm text-threads-muted leading-relaxed">
            Your account has been suspended by the platform administrator for violating our Community Guidelines. Access to posting, liking, and messaging has been revoked.
          </p>
        </div>
        <div className="p-3 rounded-xl bg-threads-elevated border border-threads-border text-xs text-threads-muted">
          If you believe this action was taken in error, contact{' '}
          <span className="font-mono text-threads-text">munderushikesh66@gmail.com</span>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="w-full py-2.5 rounded-xl bg-threads-text text-threads-bg text-sm font-semibold hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </div>
    </div>
  );
}
