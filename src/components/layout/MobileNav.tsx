'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cpu, Heart, Home, LogOut, Plus, Search, ShieldCheck, User } from 'lucide-react';
import { useDsaInspector } from '@/context/dsa-inspector-context';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/database';

interface MobileNavProps {
  profile: Profile | null;
  onOpenComposer: () => void;
}

export function MobileNav({ profile, onOpenComposer }: MobileNavProps) {
  const pathname = usePathname();
  const { toggleDrawer, isOpen } = useDsaInspector();
  const profileHref = profile ? `/profile/${profile.username}` : '/login';

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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-threads-bg/95 backdrop-blur-md border-t border-threads-border z-30 flex items-center justify-around px-2">
      <Link
        href="/"
        aria-label="Home"
        className={`p-2 rounded-xl transition ${pathname === '/' ? 'text-threads-text' : 'text-threads-muted'}`}
      >
        <Home className="w-5 h-5" strokeWidth={pathname === '/' ? 2.4 : 1.9} />
      </Link>
      <Link
        href="/search"
        aria-label="Search"
        className={`p-2 rounded-xl transition ${pathname.startsWith('/search') ? 'text-threads-text' : 'text-threads-muted'}`}
      >
        <Search className="w-5 h-5" />
      </Link>
      <button
        type="button"
        onClick={onOpenComposer}
        aria-label="New thread"
        className="px-3.5 py-1.5 rounded-xl bg-threads-surface border border-threads-border text-threads-text hover:bg-threads-hover transition"
      >
        <Plus className="w-5 h-5" />
      </button>
      <Link
        href="/activity"
        aria-label="Activity"
        className={`p-2 rounded-xl transition ${pathname.startsWith('/activity') ? 'text-threads-text' : 'text-threads-muted'}`}
      >
        <Heart className="w-5 h-5" />
      </Link>
      <Link
        href={profileHref}
        aria-label={profile ? `@${profile.username}` : 'Profile'}
        className={`p-2 rounded-xl transition ${pathname.startsWith('/profile') ? 'text-threads-text' : 'text-threads-muted'}`}
      >
        {profile?.avatar_url ? (
          <div className={`w-5 h-5 rounded-full overflow-hidden border ${pathname.startsWith('/profile') ? 'border-threads-text' : 'border-threads-border'}`}>
            <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
          </div>
        ) : profile ? (
          <div className={`w-5 h-5 rounded-full bg-threads-elevated flex items-center justify-center text-[10px] font-bold border ${pathname.startsWith('/profile') ? 'border-threads-text' : 'border-threads-border'}`}>
            {(profile.username[0] || 'U').toUpperCase()}
          </div>
        ) : (
          <User className="w-5 h-5" />
        )}
      </Link>
      {profile?.is_admin && (
        <Link
          href="/admin"
          aria-label="Admin Dashboard"
          className={`p-2 rounded-xl transition ${pathname.startsWith('/admin') ? 'text-purple-400' : 'text-threads-muted'}`}
        >
          <ShieldCheck className="w-5 h-5" />
        </Link>
      )}
      <button
        type="button"
        onClick={toggleDrawer}
        aria-label="DSA Inspector"
        className={`p-2 rounded-xl transition ${isOpen ? 'text-emerald-400' : 'text-threads-muted'}`}
      >
        <Cpu className="w-5 h-5" />
      </button>
      {profile && (
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Log out"
          title="Log out"
          className="p-2 rounded-xl text-threads-muted hover:text-red-400 transition"
        >
          <LogOut className="w-4 h-4" />
        </button>
      )}
    </nav>
  );
}
