'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Loader2, Undo2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { executeDsa } from '@/lib/dsa';
import { useDsaInspector } from '@/context/dsa-inspector-context';
import type { Post, Profile } from '@/types/database';

interface PostComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  editingPost?: Post | null;
  onSuccess?: () => void;
}

export function PostComposerModal({
  isOpen,
  onClose,
  profile,
  editingPost,
  onSuccess,
}: PostComposerModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { recordTelemetry } = useDsaInspector();

  const [content, setContent] = useState(editingPost?.content ?? '');
  const [snapshots, setSnapshots] = useState<Array<{ content: string; timestamp: string }>>([]);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(editingPost?.media_urls?.[0] ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContentChange = (next: string) => {
    if (Math.abs(next.length - content.length) >= 6 || next.endsWith(' ')) {
      setSnapshots((prev) => [
        ...prev.slice(-24),
        { content, timestamp: new Date().toISOString() },
      ]);
    }
    setContent(next);
  };

  const handleUndoDraft = async () => {
    if (snapshots.length === 0) return;
    const res = await executeDsa<{
      popped: { content: string; timestamp: string } | null;
      stack: Array<{ content: string; timestamp: string }>;
    }>(
      'draft_stack',
      { snapshots, action: 'undo' },
      recordTelemetry
    );

    if (res.ok && res.popped) {
      setContent(res.popped.content);
      setSnapshots([...res.stack].reverse());
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB.');
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setError(null);
  };

  const extractHashtags = (text: string): string[] => {
    const matches = text.match(/#[a-zA-Z0-9_]+/g) ?? [];
    return Array.from(new Set(matches.map((tag) => tag.toLowerCase())));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !file && !previewUrl) return;

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const activeUserId = profile?.id || user.id;

      // Ensure profile row exists in public.profiles to satisfy foreign key constraint
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

      const mediaUrls: string[] = editingPost?.media_urls ? [...editingPost.media_urls] : [];

      if (file) {
        const ext = file.name.split('.').pop() || 'jpg';
        const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const path = `${activeUserId}/${uniqueId}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from('thread-media')
          .upload(path, file, {
            contentType: file.type || 'image/jpeg',
            upsert: false,
          });

        if (uploadErr) {
          console.error('Storage upload error:', uploadErr);
          throw uploadErr;
        }

        const { data: publicUrlData } = supabase.storage
          .from('thread-media')
          .getPublicUrl(path);

        if (publicUrlData?.publicUrl) {
          mediaUrls.push(publicUrlData.publicUrl);
        }
      }

      const hashtags = extractHashtags(content);

      if (editingPost) {
        const { error: updateErr } = await supabase
          .from('posts')
          .update({
            content: content.trim(),
            hashtags,
            is_edited: true,
          })
          .eq('id', editingPost.id)
          .eq('author_id', activeUserId);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from('posts').insert({
          author_id: activeUserId,
          content: content.trim(),
          media_urls: mediaUrls,
          hashtags,
        });
        if (insertErr) throw insertErr;
      }

      setContent('');
      setSnapshots([]);
      setFile(null);
      setPreviewUrl(null);
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Post submit error:', err);
      setError(err instanceof Error ? err.message : 'Failed to publish thread.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
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
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-threads-border">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-threads-muted hover:text-threads-text transition"
              >
                Cancel
              </button>
              <span className="text-sm font-semibold">
                {editingPost ? 'Edit thread' : 'New thread'}
              </span>
              <button
                type="button"
                onClick={handleUndoDraft}
                disabled={snapshots.length === 0}
                title="Undo via LIFO Draft Stack"
                className="inline-flex items-center gap-1 text-xs text-threads-muted hover:text-threads-text disabled:opacity-30 transition"
              >
                <Undo2 className="w-3.5 h-3.5" />
                Undo ({snapshots.length})
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5">
              {error && (
                <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full bg-threads-elevated border border-threads-border overflow-hidden flex items-center justify-center text-xs font-semibold shrink-0">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                    ) : (
                      (profile?.username?.[0] ?? '?').toUpperCase()
                    )}
                  </div>
                  <div className="w-[1.5px] flex-1 bg-threads-border my-2 min-h-[32px]" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold mb-1">
                    {profile?.username ?? 'Posting as Authenticated User'}
                  </div>
                  <textarea
                    rows={4}
                    maxLength={500}
                    placeholder="What's new? Use #hashtags or @mentions..."
                    value={content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    className="w-full bg-transparent text-sm text-threads-text placeholder:text-threads-muted resize-none focus:outline-none"
                  />

                  {previewUrl && (
                    <div className="relative mt-2 inline-block">
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="max-h-64 rounded-2xl border border-threads-border object-cover"
                      />
                      {!editingPost && (
                        <button
                          type="button"
                          onClick={() => {
                            setFile(null);
                            setPreviewUrl(null);
                          }}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 text-white flex items-center justify-center"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {!editingPost && (
                    <div className="mt-3 flex items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-threads-muted hover:text-threads-text transition p-1.5 rounded-lg hover:bg-threads-hover"
                        title="Attach photo"
                      >
                        <ImagePlus className="w-4 h-4" />
                      </button>
                      <span className="text-[11px] text-threads-muted ml-auto font-mono">
                        {content.length}/500
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between pt-3 border-t border-threads-border">
                <span className="text-xs text-threads-muted">
                  Anyone can reply & quote
                </span>
                <button
                  type="submit"
                  disabled={submitting || (!content.trim() && !file && !previewUrl)}
                  className="px-5 py-2 rounded-full bg-threads-text text-threads-bg text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingPost ? 'Save' : 'Post'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
