'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Cpu,
  FlaskConical,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { executeDsa } from '@/lib/dsa';
import { useDsaInspector } from '@/context/dsa-inspector-context';
import { AppShell } from '@/components/layout/AppShell';
import { PostCard } from '@/components/threads/PostCard';
import { FeedSkeleton } from '@/components/threads/FeedSkeleton';
import { ReplyModal } from '@/components/threads/ReplyModal';
import { PostComposerModal } from '@/components/threads/PostComposerModal';
import { ImageLightbox } from '@/components/threads/ImageLightbox';
import type { Post, Profile } from '@/types/database';

export default function HomeFeedPage() {
  const { recordTelemetry } = useDsaInspector();
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [rankingMode, setRankingMode] = useState<'heap' | 'latest'>('heap');
  const [replyTarget, setReplyTarget] = useState<Post | null>(null);
  const [editTarget, setEditTarget] = useState<Post | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (prof) {
          setCurrentProfile(prof as Profile);
        } else {
          // Provision fallback profile
          const rawHandle =
            user.user_metadata?.preferred_username ||
            user.user_metadata?.user_name ||
            user.email?.split('@')[0] ||
            `user_${user.id.slice(0, 8)}`;
          const fallbackUsername = rawHandle.toLowerCase().replace(/[^a-z0-9_.]/g, '') || `user_${user.id.slice(0, 6)}`;
          const newProf: Profile = {
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

          await supabase.from('profiles').upsert(newProf, { onConflict: 'id' });
          setCurrentProfile(newProf);
        }
      } else {
        setCurrentProfile(null);
      }

      // Fetch root threads with author and repost metadata using column hints
      const { data: rawPosts, error } = await supabase
        .from('posts')
        .select(
          `*,
           author:profiles!author_id(*),
           repost_of:posts!repost_of_id(*, author:profiles!author_id(*))`
        )
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error || !rawPosts) {
        console.error('Feed fetch error:', error);
        setPosts([]);
        return;
      }

      // Check which posts the current viewer has liked
      let likedSet = new Set<string>();
      if (user && rawPosts.length > 0) {
        const postIds = rawPosts.map((p) => p.repost_of_id ?? p.id);
        const { data: likes } = await supabase
          .from('likes')
          .select('post_id')
          .eq('user_id', user.id)
          .in('post_id', postIds);
        likedSet = new Set((likes ?? []).map((l) => l.post_id));
      }

      // Safely normalize repost_of arrays into single objects or null
      const hydrated: Post[] = (rawPosts as any[]).map((p) => {
        const repostObj = Array.isArray(p.repost_of)
          ? p.repost_of[0] || null
          : p.repost_of || null;

        return {
          ...p,
          repost_of: repostObj
            ? { ...repostObj, viewer_has_liked: likedSet.has(repostObj.id) }
            : null,
          viewer_has_liked: likedSet.has(p.id),
        };
      });

      // Filter out posts from blocked users or reposts of blocked users
      const visiblePosts = hydrated.filter(
        (p) => !p.author?.is_blocked && !p.repost_of?.author?.is_blocked
      );

      // Max-Heap feed ranking via C++17 DSA engine
      if (rankingMode === 'heap' && visiblePosts.length > 0) {
        const now = Date.now();
        const metrics = visiblePosts.map((p) => {
          const target = p.repost_of ?? p;
          const hoursOld = Math.max(0, (now - new Date(p.created_at).getTime()) / 3600000);
          return {
            id: p.id,
            likes: target.likes_count ?? 0,
            replies: target.replies_count ?? 0,
            hours_old: Number(hoursOld.toFixed(4)),
          };
        });

        const res = await executeDsa<{
          ranked: Array<{ id: string; score: number }>;
        }>(
          'rank_feed',
          { posts: metrics, top_k: 50 },
          recordTelemetry
        );

        if (res.ok && Array.isArray(res.ranked)) {
          const byId = new Map(visiblePosts.map((p) => [p.id, p]));
          const ordered: Post[] = [];
          for (const item of res.ranked) {
            const match = byId.get(item.id);
            if (match) ordered.push({ ...match, dsa_score: item.score });
          }
          if (ordered.length > 0) {
            setPosts(ordered);
            return;
          }
        }
      }

      setPosts(visiblePosts);
    } catch (err) {
      console.error('loadFeed unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, [rankingMode, recordTelemetry]);

  useEffect(() => {
    loadFeed();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadFeed();
      } else {
        setCurrentProfile(null);
      }
    });

    const channel = supabase
      .channel('public:posts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          loadFeed();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [loadFeed]);

  return (
    <AppShell
      title="For you"
      onPostCreated={loadFeed}
      headerRight={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRankingMode((m) => (m === 'heap' ? 'latest' : 'heap'))}
            className="px-2.5 py-1 rounded-full bg-threads-surface border border-threads-border text-[11px] font-medium text-threads-muted hover:text-threads-text flex items-center gap-1 transition"
            title="Toggle Max-Heap Ranking vs Chronological"
          >
            <Sparkles className="w-3 h-3 text-emerald-400" />
            {rankingMode === 'heap' ? 'Heap Ranked' : 'Latest'}
          </button>
          <button
            type="button"
            onClick={loadFeed}
            aria-label="Refresh feed"
            className="p-1.5 rounded-full text-threads-muted hover:text-threads-text hover:bg-threads-hover transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      }
    >
      {/* Inline Quick Composer Bar */}
      <div className="px-4 py-3.5 border-b border-threads-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-full bg-threads-elevated border border-threads-border overflow-hidden flex items-center justify-center text-xs font-semibold shrink-0">
            {currentProfile?.avatar_url ? (
              <img
                src={currentProfile.avatar_url}
                alt={currentProfile.username}
                className="w-full h-full object-cover"
              />
            ) : (
              ((currentProfile?.username?.[0] || currentProfile?.full_name?.[0]) ?? '@').toUpperCase()
            )}
          </div>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="text-sm text-threads-muted text-left flex-1 truncate hover:text-threads-text transition"
          >
            {currentProfile
              ? `What's new, ${currentProfile.full_name?.split(' ')[0] || currentProfile.username}?`
              : "What's new? Sign in to post..."}
          </button>
        </div>
        {currentProfile ? (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="px-4 py-1.5 rounded-xl bg-threads-text text-threads-bg text-sm font-semibold hover:opacity-90 transition flex items-center gap-1.5 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Post
          </button>
        ) : (
          <Link
            href="/login"
            className="px-4 py-1.5 rounded-xl bg-threads-text text-threads-bg text-sm font-semibold hover:opacity-90 transition shrink-0"
          >
            Log in
          </Link>
        )}
      </div>

      {/* Guest Platform Overview Banner (only shown to guests) */}
      {!currentProfile && (
        <div className="p-4 sm:p-5 border-b border-threads-border bg-threads-elevated/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Live Preview
              </span>
              <span className="text-xs text-threads-muted">Next.js 15 + C++17 DSA Core</span>
            </div>
            <p className="text-xs text-threads-muted">
              Log in with Google or Email OTP to post threads, upload photos, like, and reply.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="px-3.5 py-1.5 rounded-xl bg-threads-text text-threads-bg text-xs font-semibold hover:opacity-90 transition"
            >
              Sign In
            </Link>
            <Link
              href="/dsa-lab"
              className="px-3 py-1.5 rounded-xl border border-threads-border text-xs text-threads-text hover:bg-threads-hover transition flex items-center gap-1"
            >
              <Cpu className="w-3 h-3 text-emerald-400" />
              DSA Lab
            </Link>
          </div>
        </div>
      )}

      {/* Feed Body */}
      {loading ? (
        <FeedSkeleton count={4} />
      ) : posts.length === 0 ? (
        <div className="p-6 sm:p-8 space-y-6">
          {currentProfile ? (
            /* Logged-in Welcome Hero */
            <div className="p-6 rounded-2xl bg-threads-elevated/40 border border-threads-border text-center space-y-4">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-threads-border mx-auto">
                {currentProfile.avatar_url ? (
                  <img
                    src={currentProfile.avatar_url}
                    alt={currentProfile.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-threads-elevated flex items-center justify-center text-2xl font-bold">
                    {(currentProfile.username[0] || 'U').toUpperCase()}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-threads-text">
                  Welcome to Threads, {currentProfile.full_name || `@${currentProfile.username}`}!
                </h2>
                <p className="text-xs sm:text-sm text-threads-muted max-w-sm mx-auto">
                  You are logged in and ready to share thoughts, photos, and replies. Your feed updates in real-time.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-threads-text text-threads-bg text-xs sm:text-sm font-semibold hover:opacity-90 transition flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create First Thread
                </button>
                <Link
                  href={`/profile/${currentProfile.username}`}
                  className="px-4 py-2.5 rounded-xl border border-threads-border text-xs sm:text-sm font-medium hover:bg-threads-hover transition"
                >
                  View Profile
                </Link>
                <Link
                  href="/dsa-lab"
                  className="px-4 py-2.5 rounded-xl border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs sm:text-sm font-medium hover:bg-emerald-500/20 transition flex items-center gap-1.5"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  DSA Lab
                </Link>
              </div>
            </div>
          ) : (
            /* Guest Onboarding Hero Card */
            <div className="p-6 sm:p-8 rounded-2xl bg-threads-elevated/30 border border-threads-border space-y-6">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-threads-elevated border border-threads-border flex items-center justify-center text-2xl font-bold mx-auto mb-3">
                  @
                </div>
                <h2 className="text-xl font-bold text-threads-text tracking-tight">
                  Welcome to Threads
                </h2>
                <p className="text-xs sm:text-sm text-threads-muted max-w-md mx-auto leading-relaxed">
                  A modern, real-time social platform engineered with Next.js 15, Supabase PostgreSQL, and an accelerated C++17 Data Structures & Algorithms core.
                </p>
              </div>

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-4 rounded-xl bg-threads-surface border border-threads-border space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-2">
                    <Zap className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-semibold text-threads-text">C++17 Engine</h3>
                  <p className="text-[11px] text-threads-muted leading-relaxed">
                    Max-Heap feed ranking & Trie autocomplete running natively in microsecond time.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-threads-surface border border-threads-border space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center mb-2">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-semibold text-threads-text">Thread Trees</h3>
                  <p className="text-[11px] text-threads-muted leading-relaxed">
                    N-ary hierarchical conversation trees with visual connector lines and DFS traversals.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-threads-surface border border-threads-border space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center mb-2">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-semibold text-threads-text">Row Level Security</h3>
                  <p className="text-[11px] text-threads-muted leading-relaxed">
                    Strict database isolation in PostgreSQL with atomic trigger-maintained counters.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Link
                  href="/login"
                  className="px-5 py-2.5 rounded-xl bg-threads-text text-threads-bg text-xs sm:text-sm font-semibold hover:opacity-90 transition"
                >
                  Sign In with Google or OTP
                </Link>
                <Link
                  href="/search"
                  className="px-4 py-2.5 rounded-xl border border-threads-border text-xs sm:text-sm font-medium hover:bg-threads-hover transition flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5" />
                  Search Threads
                </Link>
                <Link
                  href="/dsa-lab"
                  className="px-4 py-2.5 rounded-xl border border-threads-border text-xs sm:text-sm font-medium hover:bg-threads-hover transition flex items-center gap-1.5"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  DSA Benchmark Lab
                </Link>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-threads-border">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentProfile={currentProfile}
              onReplyClick={setReplyTarget}
              onEditClick={setEditTarget}
              onImageClick={setLightboxUrl}
              onMutated={loadFeed}
            />
          ))}
        </div>
      )}

      <ReplyModal
        parentPost={replyTarget}
        currentProfile={currentProfile}
        onClose={() => setReplyTarget(null)}
        onReplied={loadFeed}
      />

      <PostComposerModal
        isOpen={composerOpen || Boolean(editTarget)}
        editingPost={editTarget}
        profile={currentProfile}
        onClose={() => {
          setComposerOpen(false);
          setEditTarget(null);
        }}
        onSuccess={() => {
          setComposerOpen(false);
          setEditTarget(null);
          loadFeed();
        }}
      />

      <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </AppShell>
  );
}
