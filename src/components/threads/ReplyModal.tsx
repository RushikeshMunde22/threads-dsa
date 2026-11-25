'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Post, Profile } from '@/types/database';

interface ReplyModalProps {
  parentPost: Post | null;
  currentProfile: Profile | null;
  onClose: () => void;
  onReplied: () => void;
}

export function ReplyModal({
  parentPost,
  currentProfile,
  onClose,
  onReplied,
}: ReplyModalProps) {
  const router = useRouter();
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentPost) return;
    if (!content.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      let activeUserId = currentProfile?.id;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }
      activeUserId = activeUserId || user.id;

      // Ensure profile exists in profiles table
      const { data: existingProf } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', activeUserId)
        .maybeSingle();

      if (!existingProf) {
        const rawHandle =
          user.user_metadata?.preferred_username ||
          user.user_metadata?.user_name ||
          user.email?.split('@')[0] ||
          `user_${activeUserId.slice(0, 8)}`;
        const fallbackUsername = rawHandle.toLowerCase().replace(/[^a-z0-9_.]/g, '') || `user_${activeUserId.slice(0, 6)}`;

        await supabase.from('profiles').upsert(
          {
            id: activeUserId,
            username: fallbackUsername,
            full_name: user.user_metadata?.full_name || user.user_metadata?.name || fallbackUsername,
            avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          },
          { onConflict: 'id' }
        );
      }

      const hashtags = Array.from(
        new Set((content.match(/#[a-zA-Z0-9_]+/g) ?? []).map((t) => t.toLowerCase()))
      );

      const { error: insertErr } = await supabase.from('posts').insert({
        author_id: activeUserId,
        parent_id: parentPost.id,
        root_id: parentPost.root_id ?? parentPost.id,
        content: content.trim(),
        hashtags,
      });

      if (insertErr) throw insertErr;
      setContent('');
      onReplied();
      onClose();
    } catch (err) {
      console.error('Reply submit error:', err);
      setError(err instanceof Error ? err.message : 'Failed to post reply.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {parentPost && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[580px] rounded-3xl bg-threads-surface border border-threads-border shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-threads-border">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-threads-muted hover:text-threads-text"
              >
                Cancel
              </button>
              <span className="text-sm font-semibold">Reply</span>
              <div className="w-10" />
            </div>

            <form onSubmit={handleSubmit} className="p-5">
              {error && (
                <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                  {error}
                </div>
              )}

              {/* Parent Post Preview with Vertical Thread Connector Line */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-threads-elevated border border-threads-border overflow-hidden flex items-center justify-center text-xs font-semibold shrink-0">
                    {parentPost.author?.avatar_url ? (
                      <img
                        src={parentPost.author.avatar_url}
                        alt={parentPost.author.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (parentPost.author?.username?.[0] ?? '?').toUpperCase()
                    )}
                  </div>
                  <div className="w-[2px] flex-1 bg-threads-border my-1.5 min-h-[28px]" />
                </div>
                <div className="flex-1 pb-4 min-w-0">
                  <div className="text-sm font-semibold">
                    {parentPost.author?.username ?? 'user'}
                  </div>
                  <p className="text-sm text-threads-text/90 mt-0.5 whitespace-pre-wrap break-words">
                    {parentPost.content}
                  </p>
                </div>
              </div>

              {/* Current User Reply Box */}
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-threads-elevated border border-threads-border overflow-hidden flex items-center justify-center text-xs font-semibold shrink-0">
                  {currentProfile?.avatar_url ? (
                    <img
                      src={currentProfile.avatar_url}
                      alt={currentProfile.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (currentProfile?.username?.[0] ?? '?').toUpperCase()
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold mb-1">
                    {currentProfile?.username ?? 'Replying as Authenticated User'}
                  </div>
                  <textarea
                    rows={3}
                    maxLength={500}
                    autoFocus
                    placeholder={`Reply to ${parentPost.author?.username ?? 'thread'}...`}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full bg-transparent text-sm text-threads-text placeholder:text-threads-muted resize-none focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end pt-3 border-t border-threads-border">
                <button
                  type="submit"
                  disabled={submitting || !content.trim()}
                  className="px-5 py-2 rounded-full bg-threads-text text-threads-bg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Reply
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
