'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/database';
import { LeftRail } from './LeftRail';
import { MobileNav } from './MobileNav';
import { DsaInspectorDrawer } from './DsaInspectorDrawer';
import { PostComposerModal } from '@/components/threads/PostComposerModal';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  headerRight?: React.ReactNode;
  onPostCreated?: () => void;
}

export function AppShell({ children, title, headerRight, onPostCreated }: AppShellProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function loadProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (active) setProfile(null);
          return;
        }

        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (!active) return;

        if (data) {
          setProfile(data as Profile);
        } else {
          // Profile row does not exist yet; auto-provision from user metadata/email
          const rawName =
            user.user_metadata?.preferred_username ||
            user.user_metadata?.user_name ||
            user.email?.split('@')[0] ||
            `user_${user.id.slice(0, 8)}`;
          const fallbackUsername = rawName.toLowerCase().replace(/[^a-z0-9_.]/g, '') || `user_${user.id.slice(0, 6)}`;
          const fallbackProfile: Profile = {
            id: user.id,
            username: fallbackUsername,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || fallbackUsername,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
            bio: '',
            website: '',
            is_verified: false,
            followers_count: 0,
            following_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          await supabase.from('profiles').upsert(fallbackProfile, { onConflict: 'id' });
          if (active) setProfile(fallbackProfile);
        }
      } catch (err) {
        console.error('AppShell loadProfile error:', err);
      }
    }

    loadProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile();
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-threads-bg text-threads-text">
      <LeftRail profile={profile} onOpenComposer={() => setComposerOpen(true)} />
      <MobileNav profile={profile} onOpenComposer={() => setComposerOpen(true)} />
      <DsaInspectorDrawer />

      <div className="md:pl-[76px] pb-20 md:pb-10">
        <div className="max-w-feed mx-auto px-3 sm:px-0">
          {title && (
            <header className="sticky top-0 z-20 h-14 bg-threads-bg/90 backdrop-blur-md flex items-center justify-between px-4">
              <div className="w-8" />
              <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>
              <div className="min-w-8 flex justify-end">{headerRight}</div>
            </header>
          )}
          <main className="bg-threads-surface border border-threads-border rounded-3xl overflow-hidden shadow-sm">
            {children}
          </main>
        </div>
      </div>

      <PostComposerModal
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        profile={profile}
        onSuccess={() => {
          setComposerOpen(false);
          onPostCreated?.();
        }}
      />
    </div>
  );
}
