'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';

export default function ProfileRedirectPage() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    async function resolveProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace('/login');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .maybeSingle();

        if (profile?.username) {
          router.replace(`/profile/${profile.username}`);
          return;
        }

        // Provision missing profile row
        const rawHandle =
          user.user_metadata?.preferred_username ||
          user.user_metadata?.user_name ||
          user.email?.split('@')[0] ||
          `user_${user.id.slice(0, 8)}`;
        const fallbackUsername = rawHandle.toLowerCase().replace(/[^a-z0-9_.]/g, '') || `user_${user.id.slice(0, 6)}`;

        const { data: newProfile, error } = await supabase
          .from('profiles')
          .upsert(
            {
              id: user.id,
              username: fallbackUsername,
              full_name: user.user_metadata?.full_name || user.user_metadata?.name || fallbackUsername,
              avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
            },
            { onConflict: 'id' }
          )
          .select('username')
          .single();

        if (error) throw error;
        router.replace(`/profile/${newProfile?.username || fallbackUsername}`);
      } catch (err) {
        console.error('Resolve profile error:', err);
        setErrorMsg('Unable to load profile. Redirecting to login...');
        setTimeout(() => router.replace('/login'), 1500);
      }
    }

    resolveProfile();
  }, [router]);

  return (
    <AppShell title="Profile">
      <div className="p-16 flex flex-col items-center justify-center gap-3 text-threads-muted">
        <Loader2 className="w-6 h-6 animate-spin text-threads-text" />
        <p className="text-sm">{errorMsg || 'Opening your profile...'}</p>
      </div>
    </AppShell>
  );
}
