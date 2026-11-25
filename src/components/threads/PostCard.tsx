'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  BadgeCheck,
  Check,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Repeat2,
  Send,
  Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Post, Profile } from '@/types/database';

interface PostCardProps {
  post: Post;
  currentProfile: Profile | null;
  showConnectorBelow?: boolean;
  onReplyClick?: (post: Post) => void;
  onEditClick?: (post: Post) => void;
  onImageClick?: (url: string) => void;
  onMutated?: () => void;
}

function formatRelativeTime(iso: string): string {
  if (!iso) return '';
  const diffSec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export function PostCard({
  post,
  currentProfile,
  showConnectorBelow = false,
  onReplyClick,
  onEditClick,
  onImageClick,
  onMutated,
}: PostCardProps) {
  const router = useRouter();

  // Handle repost resolution safely (handles array vs object from PostgREST)
  const repostTarget = (Array.isArray(post.repost_of)
    ? (post.repost_of[0] ?? null)
    : post.repost_of) as Post | null;
  const isRepost = Boolean(post.repost_of_id && repostTarget);
  const displayPost: Post = isRepost && repostTarget ? repostTarget : post;
  const isOwner = currentProfile?.id === post.author_id;

  const [liked, setLiked] = useState(Boolean(displayPost.viewer_has_liked));
  const [likesCount, setLikesCount] = useState<number>(displayPost.likes_count ?? 0);
  const [repostsCount, setRepostsCount] = useState<number>(displayPost.reposts_count ?? 0);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleToggleLike = async () => {
    if (!currentProfile) {
      router.push('/login');
      return;
    }
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikesCount((c: number) => Math.max(0, c + (nextLiked ? 1 : -1)));

    const supabase = createClient();
    if (nextLiked) {
      const { error } = await supabase.from('likes').insert({
        user_id: currentProfile.id,
        post_id: displayPost.id,
      });
      if (error) {
        setLiked(!nextLiked);
        setLikesCount((c: number) => Math.max(0, c - 1));
      }
    } else {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('user_id', currentProfile.id)
        .eq('post_id', displayPost.id);
      if (error) {
        setLiked(!nextLiked);
        setLikesCount((c: number) => c + 1);
      }
    }
  };

  const handleRepost = async () => {
    if (!currentProfile) {
      router.push('/login');
      return;
    }
    setRepostsCount((c: number) => c + 1);
    const supabase = createClient();
    const { error } = await supabase.from('posts').insert({
      author_id: currentProfile.id,
      repost_of_id: displayPost.id,
      content: '',
    });
    if (error) {
      setRepostsCount((c: number) => Math.max(0, c - 1));
    } else {
      onMutated?.();
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/thread/${displayPost.root_id ?? displayPost.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDelete = async () => {
    if (!currentProfile || !isOwner) return;
    setMenuOpen(false);
    const supabase = createClient();
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', post.id)
      .eq('author_id', currentProfile.id);
    if (!error) onMutated?.();
  };

  const author = displayPost.author;

  return (
    <article className="px-4 py-3.5 hover:bg-threads-hover/40 transition-colors">
      {isRepost && (
        <div className="flex items-center gap-2 text-xs text-threads-muted mb-2 pl-7">
          <Repeat2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{post.author?.username ?? 'Someone'} reposted</span>
        </div>
      )}

      <div className="flex gap-3">
        {/* Left Avatar + Crisp Thread Connector Line */}
        <div className="flex flex-col items-center shrink-0">
          <Link
            href={author?.username ? `/profile/${author.username}` : '#'}
            className="w-9 h-9 rounded-full bg-threads-elevated border border-threads-border overflow-hidden flex items-center justify-center text-xs font-semibold hover:opacity-90 transition"
          >
            {author?.avatar_url ? (
              <img src={author.avatar_url} alt={author.username} className="w-full h-full object-cover" />
            ) : (
              (author?.username?.[0] ?? '?').toUpperCase()
            )}
          </Link>
          {showConnectorBelow && (
            <div className="w-[2px] flex-1 bg-threads-border mt-2 rounded-full min-h-[20px]" />
          )}
        </div>

        {/* Right Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Link
                href={author?.username ? `/profile/${author.username}` : '#'}
                className="text-[14px] font-semibold hover:underline truncate flex items-center gap-1"
              >
                <span>{author?.username ?? 'unknown'}</span>
                {author?.is_verified && (
                  <span title="Verified Account">
                    <BadgeCheck className="w-3.5 h-3.5 text-emerald-400 fill-emerald-500/10 shrink-0" />
                  </span>
                )}
              </Link>
              <span className="text-xs text-threads-muted shrink-0">
                {formatRelativeTime(displayPost.created_at)}
              </span>
              {displayPost.is_edited && (
                <span className="text-[11px] text-threads-muted">(edited)</span>
              )}
              {typeof post.dsa_score === 'number' && (
                <span
                  title="Max-Heap engagement-decay score"
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-threads-elevated border border-threads-border text-emerald-400"
                >
                  {post.dsa_score.toFixed(2)}
                </span>
              )}
            </div>

            {isOwner && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="p-1 rounded-full text-threads-muted hover:text-threads-text hover:bg-threads-hover transition"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-1 w-36 rounded-2xl bg-threads-elevated border border-threads-border shadow-xl py-1 z-20 text-xs">
                    {!isRepost && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onEditClick?.(post);
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-threads-hover flex items-center gap-2"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="w-full px-3.5 py-2 text-left text-red-400 hover:bg-threads-hover flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Post Content */}
          <Link href={`/thread/${displayPost.root_id ?? displayPost.id}`} className="block mt-1">
            <p className="text-[15px] leading-[1.45] whitespace-pre-wrap break-words text-threads-text">
              {displayPost.content}
            </p>
          </Link>

          {/* Media Gallery */}
          {displayPost.media_urls && displayPost.media_urls.length > 0 && (
            <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
              {displayPost.media_urls.map((url: string, idx: number) => (
                <button
                  key={`${url}-${idx}`}
                  type="button"
                  onClick={() => onImageClick?.(url)}
                  className="rounded-2xl overflow-hidden border border-threads-border max-h-[380px] shrink-0"
                >
                  <img
                    src={url}
                    alt="Thread media"
                    className="max-h-[380px] w-auto object-cover hover:opacity-95 transition"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Action Bar: Heart, Comment, Repost, Share */}
          <div className="mt-2.5 -ml-2 flex items-center gap-1 text-threads-muted">
            <motion.button
              whileTap={{ scale: 0.85 }}
              type="button"
              onClick={handleToggleLike}
              className={`px-2.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs hover:bg-threads-hover transition ${
                liked ? 'text-rose-500' : 'hover:text-threads-text'
              }`}
            >
              <Heart className="w-[18px] h-[18px]" fill={liked ? 'currentColor' : 'none'} />
              {likesCount > 0 && <span>{likesCount}</span>}
            </motion.button>

            <button
              type="button"
              onClick={() => onReplyClick?.(displayPost)}
              className="px-2.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs hover:text-threads-text hover:bg-threads-hover transition"
            >
              <MessageCircle className="w-[18px] h-[18px]" />
              {displayPost.replies_count > 0 && <span>{displayPost.replies_count}</span>}
            </button>

            <button
              type="button"
              onClick={handleRepost}
              className="px-2.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs hover:text-emerald-400 hover:bg-threads-hover transition"
            >
              <Repeat2 className="w-[18px] h-[18px]" />
              {repostsCount > 0 && <span>{repostsCount}</span>}
            </button>

            <button
              type="button"
              onClick={handleShare}
              title="Copy link"
              className="px-2.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs hover:text-threads-text hover:bg-threads-hover transition"
            >
              {copied ? (
                <Check className="w-[17px] h-[17px] text-emerald-400" />
              ) : (
                <Send className="w-[17px] h-[17px]" />
              )}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
