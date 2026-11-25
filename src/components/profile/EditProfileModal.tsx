'use client';

import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/database';

interface EditProfileModalProps {
  isOpen: boolean;
  profile: Profile;
  onClose: () => void;
  onUpdated: (updated: Profile) => void;
}

export function EditProfileModal({
  isOpen,
  profile,
  onClose,
  onUpdated,
}: EditProfileModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(profile.username);
  const [fullName, setFullName] = useState(profile.full_name);
  const [bio, setBio] = useState(profile.bio);
  const [website, setWebsite] = useState(profile.website ?? '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError('Avatar must be under 5 MB.');
      return;
    }
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const supabase = createClient();
      let nextAvatarUrl = profile.avatar_url;

      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop() || 'jpg';
        const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true });
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
        nextAvatarUrl = pub.publicUrl;
      }

      const cleanHandle = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
      const { data, error: updateErr } = await supabase
        .from('profiles')
        .update({
          username: cleanHandle,
          full_name: fullName.trim(),
          bio: bio.trim(),
          website: website.trim(),
          avatar_url: nextAvatarUrl,
        })
        .eq('id', profile.id)
        .select('*')
        .single();

      if (updateErr) throw updateErr;
      onUpdated(data as Profile);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
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
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] rounded-3xl bg-threads-surface border border-threads-border shadow-2xl p-6"
          >
            <h2 className="text-base font-semibold mb-4">Edit profile</h2>
            {error && (
              <div className="mb-3 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative w-16 h-16 rounded-full bg-threads-elevated border border-threads-border overflow-hidden flex items-center justify-center group"
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold">{username[0]?.toUpperCase()}</span>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                <div className="flex-1">
                  <label className="text-xs text-threads-muted block mb-1">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full rounded-xl bg-threads-elevated border border-threads-border px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-threads-muted block mb-1">@handle</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  maxLength={30}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl bg-threads-elevated border border-threads-border px-3 py-2 text-sm focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-threads-muted block mb-1">Bio</label>
                <textarea
                  rows={3}
                  maxLength={300}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full rounded-xl bg-threads-elevated border border-threads-border px-3 py-2 text-sm resize-none focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs text-threads-muted block mb-1">Link</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full rounded-xl bg-threads-elevated border border-threads-border px-3 py-2 text-sm focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-threads-border text-sm text-threads-muted hover:text-threads-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-threads-text text-threads-bg text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Done
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
