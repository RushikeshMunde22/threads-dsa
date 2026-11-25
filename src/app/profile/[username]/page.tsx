'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BadgeCheck, ExternalLink, ShieldAlert, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { executeDsa } from '@/lib/dsa';
import { useDsaInspector } from '@/context/dsa-inspector-context';
import { AppShell } from '@/components/layout/AppShell';
import { PostCard } from '@/components/threads/PostCard';
import { FeedSkeleton } from '@/components/threads/FeedSkeleton';
import { ReplyModal } from '@/components/threads/ReplyModal';
import { ImageLightbox } from '@/components/threads/ImageLightbox';
import { EditProfileModal } from '@/components/profile/EditProfileModal';
import { VerificationModal } from '@/components/verification/VerificationModal';
import { FollowListModal } from '@/components/profile/FollowListModal';
import type { Post, Profile } from '@/types/database';

type ProfileTab = 'threads' | 'replies' | 'reposts';

export default function ProfilePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const { recordTelemetry } = useDsaInspector();

  const [viewer, setViewer] = useState<Profile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<ProfileTab>('threads');
  const [isFollowing, setIsFollowing] = useState(false);
  const [mutualProfiles, setMutualProfiles] = useState<Profile[]>([]);
  const [recommendedProfiles, setRecommendedProfiles] = useState<
    Array<{ profile: Profile; mutualCount: number }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Post | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [followModalOpen, setFollowModalOpen] = useState(false);
  const [followModalTab, setFollowModalTab] = useState<'followers' | 'following'>('followers');

  const loadProfileData = useCallback(async () => {
    if (!params?.username) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let viewerProf: Profile | null = null;
      if (user) {
        const { data: me } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (me) {
          viewerProf = me as Profile;
          setViewer(viewerProf);
        }
      }

      const rawUser = params?.username ? decodeURIComponent(params.username) : '';
      const cleanUsername = rawUser.replace(/^@/, '');

      const { data: target } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', cleanUsername)
        .maybeSingle();

      if (!target) {
        setProfile(null);
        return;
      }
      const targetProf = target as Profile;
      setProfile(targetProf);

      const [{ data: userPosts }, { data: allEdges }, { data: allProfs }] =
        await Promise.all([
          supabase
            .from('posts')
            .select(
              `*,
               author:profiles!author_id(*),
               repost_of:posts!repost_of_id(*, author:profiles!author_id(*))`
            )
            .eq('author_id', targetProf.id)
            .order('created_at', { ascending: false }),
          supabase.from('follows').select('follower_id, following_id').limit(2000),
          supabase.from('profiles').select('*').limit(500),
        ]);

      // Normalize repost_of arrays
      const hydratedPosts: Post[] = ((userPosts ?? []) as any[]).map((p) => {
        const repostObj = Array.isArray(p.repost_of)
          ? p.repost_of[0] || null
          : p.repost_of || null;
        return {
          ...p,
          repost_of: repostObj,
        };
      });

      setPosts(hydratedPosts);

      const edges = allEdges ?? [];
      if (viewerProf) {
        setIsFollowing(
          edges.some(
            (e) => e.follower_id === viewerProf!.id && e.following_id === targetProf.id
          )
        );
      }

      // Run C++17 Directed Social Graph BFS for Mutuals & Friend-of-Friend Recommendations
      const graphRes = await executeDsa<{
        mutuals: string[];
        recommendations: Array<{ user_id: string; mutual_count: number }>;
      }>(
        'social_graph',
        {
          edges,
          user_id: viewerProf?.id ?? targetProf.id,
          target_user_id:
            viewerProf && viewerProf.id !== targetProf.id ? targetProf.id : '',
          limit: 5,
        },
        recordTelemetry
      );

      if (graphRes.ok) {
        const profMap = new Map(((allProfs ?? []) as Profile[]).map((p) => [p.id, p]));
        setMutualProfiles(
          (graphRes.mutuals ?? [])
            .map((id) => profMap.get(id))
            .filter((p): p is Profile => Boolean(p))
        );
        setRecommendedProfiles(
          (graphRes.recommendations ?? [])
            .map((r) => {
              const p = profMap.get(r.user_id);
              return p ? { profile: p, mutualCount: r.mutual_count } : null;
            })
            .filter((x): x is { profile: Profile; mutualCount: number } => Boolean(x))
        );
      }
    } finally {
      setLoading(false);
    }
  }, [params?.username, recordTelemetry]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  const handleToggleFollow = async () => {
    if (!viewer || !profile) {
      router.push('/login');
      return;
    }
    const next = !isFollowing;
    setIsFollowing(next);
    setProfile((p) =>
      p ? { ...p, followers_count: Math.max(0, p.followers_count + (next ? 1 : -1)) } : p
    );

    const supabase = createClient();
    if (next) {
      await supabase.from('follows').insert({
        follower_id: viewer.id,
        following_id: profile.id,
      });
    } else {
      await supabase
        .from('follows')
        .delete()
        .eq('follower_id', viewer.id)
        .eq('following_id', profile.id);
    }
  };

  const filteredPosts = posts.filter((p) => {
    if (tab === 'threads') return !p.parent_id && !p.repost_of_id;
    if (tab === 'replies') return Boolean(p.parent_id);
    return Boolean(p.repost_of_id);
  });

  const isOwnProfile = Boolean(viewer && profile && viewer.id === profile.id);

  return (
    <AppShell title={profile ? `@${profile.username}` : 'Profile'}>
      {loading ? (
        <FeedSkeleton count={3} />
      ) : !profile ? (
        <div className="p-12 text-center text-sm text-threads-muted space-y-3">
          <p>Profile not found.</p>
          <Link
            href="/"
            className="inline-block px-4 py-1.5 rounded-xl bg-threads-elevated border border-threads-border text-xs text-threads-text hover:bg-threads-hover"
          >
            Back to Home Feed
          </Link>
        </div>
      ) : (
        <>
          {/* Profile Header */}
          <div className="p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
                    {profile.full_name || profile.username}
                  </h2>
                  {profile.is_verified && (
                    <span title="Verified Account">
                      <BadgeCheck className="w-5 h-5 text-emerald-400 fill-emerald-500/10 shrink-0" />
                    </span>
                  )}
                  {profile.is_admin && (
                    <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono border border-purple-500/30 font-bold">
                      ADMIN
                    </span>
                  )}
                </div>
                <div className="text-sm text-threads-muted mt-0.5">
                  @{profile.username}
                </div>
              </div>
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-threads-elevated border-2 border-threads-border overflow-hidden flex items-center justify-center text-xl sm:text-2xl font-bold shrink-0">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (profile.username[0] || 'U').toUpperCase()
                )}
              </div>
            </div>

            {profile.is_blocked && (
              <div className="mt-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center gap-2.5 text-red-400 text-xs">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Account Suspended:</strong> This user has been suspended by an administrator for violating community guidelines.
                </span>
              </div>
            )}

            {profile.bio && (
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
                {profile.bio}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-threads-muted">
              <button
                type="button"
                onClick={() => {
                  setFollowModalTab('followers');
                  setFollowModalOpen(true);
                }}
                className="hover:underline hover:text-threads-text transition text-left cursor-pointer"
                title="View followers list"
              >
                <strong className="text-threads-text">{profile.followers_count}</strong> followers
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => {
                  setFollowModalTab('following');
                  setFollowModalOpen(true);
                }}
                className="hover:underline hover:text-threads-text transition text-left cursor-pointer"
                title="View following list"
              >
                <strong className="text-threads-text">{profile.following_count}</strong> following
              </button>
              {profile.website && (
                <>
                  <span>·</span>
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-threads-text truncate max-w-[200px]"
                  >
                    {profile.website.replace(/^https?:\/\//, '')}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </>
              )}
            </div>

            {/* Mutuals Badge from C++ SocialGraph */}
            {!isOwnProfile && mutualProfiles.length > 0 && !profile.is_blocked && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
                <Users className="w-3.5 h-3.5" />
                <span>
                  {mutualProfiles.length} mutual connection{mutualProfiles.length > 1 ? 's' : ''}:{' '}
                  {mutualProfiles
                    .slice(0, 3)
                    .map((m) => `@${m.username}`)
                    .join(', ')}
                </span>
              </div>
            )}

            <div className="mt-5">
              {profile.is_blocked && !viewer?.is_admin ? (
                <div className="py-2 px-4 rounded-xl bg-threads-elevated border border-threads-border text-xs text-center text-threads-muted">
                  Interaction disabled for suspended account
                </div>
              ) : isOwnProfile ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="flex-1 py-2 rounded-xl border border-threads-border text-xs sm:text-sm font-semibold hover:bg-threads-hover transition"
                  >
                    Edit profile
                  </button>
                  <button
                    type="button"
                    onClick={() => setVerifyOpen(true)}
                    className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition ${
                      profile.is_verified
                        ? 'border border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                        : 'border border-threads-border text-threads-text hover:bg-threads-hover'
                    }`}
                  >
                    <BadgeCheck className="w-4 h-4 text-emerald-400" />
                    {profile.is_verified ? 'Verified ✓' : 'Apply for Tick'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleFollow}
                  className={`w-full py-2 rounded-xl text-sm font-semibold transition ${
                    isFollowing
                      ? 'border border-threads-border text-threads-text hover:bg-threads-hover'
                      : 'bg-threads-text text-threads-bg hover:opacity-90'
                  }`}
                >
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </div>

            {/* BFS 2-Hop Friend-of-Friend Recommendations */}
            {recommendedProfiles.length > 0 && (
              <div className="mt-5 rounded-2xl bg-threads-bg border border-threads-border p-3.5">
                <div className="text-[11px] uppercase tracking-wider text-threads-muted font-medium mb-2.5">
                  Suggested via 2-Hop BFS Social Graph
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {recommendedProfiles.map(({ profile: rec, mutualCount }) => (
                    <Link
                      key={rec.id}
                      href={`/profile/${rec.username}`}
                      className="px-3 py-2 rounded-xl bg-threads-surface border border-threads-border hover:border-threads-muted transition shrink-0 text-xs"
                    >
                      <div className="font-semibold">@{rec.username}</div>
                      <div className="text-[11px] text-emerald-400">
                        {mutualCount} mutual{mutualCount > 1 ? 's' : ''}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tabs: Threads | Replies | Reposts */}
          <div className="grid grid-cols-3 border-b border-threads-border text-sm font-medium">
            {(['threads', 'replies', 'reposts'] as ProfileTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`py-3 capitalize border-b-2 transition ${
                  tab === t
                    ? 'border-threads-text text-threads-text'
                    : 'border-transparent text-threads-muted hover:text-threads-text'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {profile.is_blocked && !viewer?.is_admin ? (
            <div className="p-12 text-center text-xs text-threads-muted space-y-2">
              <ShieldAlert className="w-8 h-8 text-red-400 mx-auto" />
              <p className="font-semibold text-threads-text text-sm">Account Content Hidden</p>
              <p>Posts from suspended accounts are hidden from public view by the administrator.</p>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="p-10 text-center text-xs text-threads-muted">
              No {tab} yet.
            </div>
          ) : (
            <div className="divide-y divide-threads-border">
              {filteredPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentProfile={viewer}
                  onReplyClick={setReplyTarget}
                  onImageClick={setLightboxUrl}
                  onMutated={loadProfileData}
                />
              ))}
            </div>
          )}

          {isOwnProfile && (
            <>
              <EditProfileModal
                isOpen={editOpen}
                profile={profile}
                onClose={() => setEditOpen(false)}
                onUpdated={(updated) => {
                  setProfile(updated);
                  if (updated.username !== params.username) {
                    router.replace(`/profile/${updated.username}`);
                  }
                }}
              />
              <VerificationModal
                isOpen={verifyOpen}
                profile={profile}
                onClose={() => setVerifyOpen(false)}
                onStatusChange={loadProfileData}
              />
            </>
          )}
        </>
      )}

      <ReplyModal
        parentPost={replyTarget}
        currentProfile={viewer}
        onClose={() => setReplyTarget(null)}
        onReplied={loadProfileData}
      />
      <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      {profile && (
        <FollowListModal
          isOpen={followModalOpen}
          onClose={() => setFollowModalOpen(false)}
          targetProfile={profile}
          initialTab={followModalTab}
          currentViewerId={viewer?.id}
          onFollowToggled={loadProfileData}
        />
      )}
    </AppShell>
  );
}
