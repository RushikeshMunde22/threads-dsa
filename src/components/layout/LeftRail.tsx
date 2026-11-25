'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Cpu,
  FlaskConical,
  Heart,
  Home,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { useTheme } from '@/context/theme-context';
import { useDsaInspector } from '@/context/dsa-inspector-context';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/database';

interface LeftRailProps {
  profile: Profile | null;
  onOpenComposer: () => void;
}

export function LeftRail({ profile, onOpenComposer }: LeftRailProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { isOpen, toggleDrawer, latest } = useDsaInspector();

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Continue with redirect
    }
    window.location.href = '/api/auth/signout';
  };

  const navItems = [
    { href: '/', label: 'Home', icon: Home, active: pathname === '/' },
    { href: '/search', label: 'Search', icon: Search, active: pathname.startsWith('/search') },
  ];

  const profileHref = profile ? `/profile/${profile.username}` : '/login';

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-[76px] flex-col items-center justify-between py-5 z-30 bg-threads-bg border-r border-threads-border/60">
      {/* Top Threads @ Logo */}
      <Link
        href="/"
        aria-label="Threads Home"
        className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl font-bold tracking-tight hover:scale-105 transition"
      >
        @
      </Link>

      {/* Center Primary Navigation */}
      <nav className="flex flex-col items-center gap-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`w-14 h-12 rounded-xl flex items-center justify-center transition ${
                item.active
                  ? 'text-threads-text bg-threads-hover'
                  : 'text-threads-muted hover:text-threads-text hover:bg-threads-hover'
              }`}
            >
              <Icon className="w-[23px] h-[23px]" strokeWidth={item.active ? 2.4 : 1.9} />
            </Link>
          );
        })}

        {/* Create Post (+) */}
        <button
          type="button"
          onClick={onOpenComposer}
          title={profile ? "New thread" : "Sign in to post"}
          className="w-14 h-12 rounded-xl bg-threads-surface border border-threads-border text-threads-muted hover:text-threads-text hover:border-threads-muted/60 flex items-center justify-center transition"
        >
          <Plus className="w-[23px] h-[23px]" strokeWidth={2.2} />
        </button>

        {/* Activity Heart */}
        <Link
          href="/activity"
          title="Activity"
          className={`w-14 h-12 rounded-xl flex items-center justify-center transition ${
            pathname.startsWith('/activity')
              ? 'text-threads-text bg-threads-hover'
              : 'text-threads-muted hover:text-threads-text hover:bg-threads-hover'
          }`}
        >
          <Heart
            className="w-[23px] h-[23px]"
            strokeWidth={pathname.startsWith('/activity') ? 2.4 : 1.9}
          />
        </Link>

        {/* Profile */}
        <Link
          href={profileHref}
          title={profile ? `@${profile.username} (View profile)` : 'Log in / Sign up'}
          className={`w-14 h-12 rounded-xl flex items-center justify-center transition ${
            pathname.startsWith('/profile')
              ? 'text-threads-text bg-threads-hover'
              : 'text-threads-muted hover:text-threads-text hover:bg-threads-hover'
          }`}
        >
          {profile?.avatar_url ? (
            <div className={`w-7 h-7 rounded-full overflow-hidden border-2 ${pathname.startsWith('/profile') ? 'border-threads-text' : 'border-threads-border'}`}>
              <img
                src={profile.avatar_url}
                alt={profile.username}
                className="w-full h-full object-cover"
              />
            </div>
          ) : profile ? (
            <div className={`w-7 h-7 rounded-full bg-threads-elevated flex items-center justify-center text-xs font-bold border ${pathname.startsWith('/profile') ? 'border-threads-text' : 'border-threads-border'}`}>
              {(profile.username[0] || 'U').toUpperCase()}
            </div>
          ) : (
            <User
              className="w-[23px] h-[23px]"
              strokeWidth={pathname.startsWith('/profile') ? 2.4 : 1.9}
            />
          )}
        </Link>

        {/* Isolated DSA Lab */}
        <Link
          href="/dsa-lab"
          title="DSA Benchmark Lab"
          className={`w-14 h-12 rounded-xl flex items-center justify-center transition ${
            pathname.startsWith('/dsa-lab')
              ? 'text-emerald-400 bg-emerald-500/10'
              : 'text-threads-muted hover:text-threads-text hover:bg-threads-hover'
          }`}
        >
          <FlaskConical className="w-[21px] h-[21px]" />
        </Link>

        {/* Admin Dashboard Shield (visible to Admins) */}
        {profile?.is_admin && (
          <Link
            href="/admin"
            title="Administrator Control Center"
            className={`w-14 h-12 rounded-xl flex items-center justify-center transition ${
              pathname.startsWith('/admin')
                ? 'text-purple-400 bg-purple-500/15 border border-purple-500/40'
                : 'text-threads-muted hover:text-purple-400 hover:bg-threads-hover'
            }`}
          >
            <ShieldCheck className="w-[22px] h-[22px]" />
          </Link>
        )}
      </nav>

      {/* Bottom Controls: DSA Inspector, Theme, Auth */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={toggleDrawer}
          title="DSA Complexity Inspector"
          className={`relative w-12 h-11 rounded-xl flex items-center justify-center transition ${
            isOpen
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
              : 'text-threads-muted hover:text-threads-text hover:bg-threads-hover'
          }`}
        >
          <Cpu className="w-5 h-5" />
          {latest && (
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-12 h-11 rounded-xl flex items-center justify-center text-threads-muted hover:text-threads-text hover:bg-threads-hover transition"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {profile ? (
          <button
            type="button"
            onClick={handleSignOut}
            title={`Log out (@${profile.username})`}
            className="w-12 h-11 rounded-xl flex items-center justify-center text-threads-muted hover:text-red-400 hover:bg-threads-hover transition group"
          >
            <LogOut className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
        ) : (
          <Link
            href="/login"
            title="Log in"
            className="w-12 h-11 rounded-xl flex items-center justify-center text-threads-muted hover:text-threads-text hover:bg-threads-hover transition"
          >
            <LogIn className="w-5 h-5" />
          </Link>
        )}
      </div>
    </aside>
  );
}
