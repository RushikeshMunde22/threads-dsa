'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Hash, Search as SearchIcon, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { executeDsa } from '@/lib/dsa';
import { useDsaInspector } from '@/context/dsa-inspector-context';
import { AppShell } from '@/components/layout/AppShell';
import { PostCard } from '@/components/threads/PostCard';
import { ReplyModal } from '@/components/threads/ReplyModal';
import { ImageLightbox } from '@/components/threads/ImageLightbox';
import type { Post, Profile } from '@/types/database';

export default function SearchPage() {
  const { recordTelemetry } = useDsaInspector();
  const [query, setQuery] = useState('');
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [tokens, setTokens] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [matchedPosts, setMatchedPosts] = useState<Post[]>([]);
  const [replyTarget, setReplyTarget] = useState<Post | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    async function bootstrapCorpus() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: me } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (me) setCurrentProfile(me as Profile);
      }

      const [{ data: profilesData }, { data: postsData }] = await Promise.all([
        supabase.from('profiles').select('*').limit(500),
        supabase
          .from('posts')
          .select('*, author:profiles!author_id(*)')
          .order('created_at', { ascending: false })
          .limit(300),
      ]);

      const profs = ((profilesData ?? []) as Profile[]).filter((p) => !p.is_blocked);
      const posts = ((postsData ?? []) as Post[]).filter((p) => !p.author?.is_blocked);
      setAllProfiles(profs);
      setAllPosts(posts);

      const tokenSet = new Set<string>();
      for (const p of profs) tokenSet.add(`@${p.username}`);
      for (const post of posts) {
        for (const tag of post.hashtags ?? []) {
          tokenSet.add(tag.startsWith('#') ? tag : `#${tag}`);
        }
      }
      setTokens(Array.from(tokenSet));
    }

    bootstrapCorpus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSuggestions([]);
      setMatchedPosts([]);
      return;
    }

    const timer = setTimeout(async () => {
      const res = await executeDsa<{
        suggestions: string[];
        matches: Array<{ post_id: string; match_index: number }>;
      }>(
        'search',
        {
          tokens,
          posts: allPosts.map((p) => ({
            id: p.id,
            author_username: p.author?.username ?? '',
            content: p.content,
          })),
          query: q,
          limit: 10,
        },
        recordTelemetry
      );

      if (res.ok) {
        setSuggestions(res.suggestions ?? []);
        const matchIds = new Set((res.matches ?? []).map((m) => m.post_id));
        setMatchedPosts(allPosts.filter((p) => matchIds.has(p.id)));
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [query, tokens, allPosts, recordTelemetry]);

  const profileByHandle = new Map(allProfiles.map((p) => [`@${p.username}`, p]));

  return (
    <AppShell title="Search">
      <div className="p-4 border-b border-threads-border">
        <div className="relative">
          <SearchIcon className="w-4 h-4 text-threads-muted absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search @usernames, #hashtags (Trie), or post text (KMP)..."
            className="w-full rounded-2xl bg-threads-bg border border-threads-border pl-11 pr-4 py-3 text-sm text-threads-text placeholder:text-threads-muted focus:outline-none focus:border-threads-muted"
          />
        </div>

        {/* Trie Autocomplete Chips */}
        {suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((tok) => {
              const isHandle = tok.startsWith('@');
              const prof = profileByHandle.get(tok);
              if (isHandle && prof) {
                return (
                  <Link
                    key={tok}
                    href={`/profile/${prof.username}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-threads-elevated border border-threads-border text-xs hover:border-threads-muted transition"
                  >
                    <User className="w-3 h-3 text-emerald-400" />
                    {tok}
                  </Link>
                );
              }
              return (
                <button
                  key={tok}
                  type="button"
                  onClick={() => setQuery(tok)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-threads-elevated border border-threads-border text-xs hover:border-threads-muted transition"
                >
                  <Hash className="w-3 h-3 text-sky-400" />
                  {tok.replace(/^#/, '')}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Results */}
      {!query.trim() ? (
        <div className="divide-y divide-threads-border">
          <div className="px-4 py-3 text-xs font-medium text-threads-muted">
            People on Threads ({allProfiles.length})
          </div>
          {allProfiles.slice(0, 15).map((p) => (
            <Link
              key={p.id}
              href={`/profile/${p.username}`}
              className="px-4 py-3 flex items-center justify-between hover:bg-threads-hover/40 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-threads-elevated border border-threads-border overflow-hidden flex items-center justify-center text-xs font-semibold">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.username} className="w-full h-full object-cover" />
                  ) : (
                    (p.username[0] || 'U').toUpperCase()
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold flex items-center gap-1">
                    <span>{p.username}</span>
                    {p.is_verified && (
                      <BadgeCheck className="w-3.5 h-3.5 text-emerald-400 fill-emerald-500/10 shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-threads-muted">{p.full_name || p.bio}</div>
                </div>
              </div>
              <span className="text-xs text-threads-muted">
                {p.followers_count} followers
              </span>
            </Link>
          ))}
          {allProfiles.length === 0 && (
            <div className="p-10 text-center text-xs text-threads-muted">
              No registered profiles in Supabase yet.
            </div>
          )}
        </div>
      ) : matchedPosts.length === 0 && suggestions.length === 0 ? (
        <div className="p-10 text-center text-xs text-threads-muted">
          No Trie or KMP matches for &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="divide-y divide-threads-border">
          {matchedPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentProfile={currentProfile}
              onReplyClick={setReplyTarget}
              onImageClick={setLightboxUrl}
            />
          ))}
        </div>
      )}

      <ReplyModal
        parentPost={replyTarget}
        currentProfile={currentProfile}
        onClose={() => setReplyTarget(null)}
        onReplied={() => {}}
      />
      <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </AppShell>
  );
}
