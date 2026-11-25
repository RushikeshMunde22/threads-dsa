'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Loader2, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/database';

interface FollowListModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetProfile: Profile;
  initialTab?: 'followers' | 'following';
  currentViewerId?: string;
  onFollowToggled?: () => void;
}

export function FollowListModal({
  isOpen,
  onClose,
  targetProfile,
  initialTab = 'followers',
  currentViewerId,
  onFollowToggled,
}: FollowListModalProps) {
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialTab);
  const [users, setUsers] = useState<Profile[]>([]);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Synchronize initialTab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const loadList = useCallback(async () => {
    if (!targetProfile?.id) return;
    setLoading(true);
    try {
      const supabase = createClient();

      if (activeTab === 'followers') {
        // Query users who follow targetProfile
        const { data: edges, error } = await supabase
          .from('follows')
          .select('follower:profiles!follower_id(*)')
          .eq('following_id', targetProfile.id);

        if (error) throw error;
        const profs = (edges ?? [])
          .map((e: any) => e.follower as Profile)
          .filter((p): p is Profile => Boolean(p) && !p.is_blocked);
        setUsers(profs);
      } else {
        // Query users who targetProfile follows
        const { data: edges, error } = await supabase
          .from('follows')
          .select('following:profiles!following_id(*)')
          .eq('follower_id', targetProfile.id);

        if (error) throw error;
        const profs = (edges ?? [])
          .map((e: any) => e.following as Profile)
          .filter((p): p is Profile => Boolean(p) && !p.is_blocked);
        setUsers(profs);
      }

      // If viewer is logged in, find who the viewer currently follows
      if (currentViewerId) {
        const { data: viewerEdges } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', currentViewerId);

        setFollowingSet(new Set((viewerEdges ?? []).map((e) => e.following_id)));
      }
    } catch (err) {
      console.error('Failed to load follow list:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, targetProfile?.id, currentViewerId]);

  useEffect(() => {
    if (isOpen) {
      loadList();
    }
  }, [isOpen, loadList]);

  const handleToggleFollow = async (userId: string) => {
    if (!currentViewerId || currentViewerId === userId) return;
    setActionLoading(userId);

    const isFollowing = followingSet.has(userId);
    try {
      const supabase = createClient();
      if (isFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentViewerId)
          .eq('following_id', userId);
        if (error) throw error;

        setFollowingSet((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: currentViewerId, following_id: userId });
        if (error) throw error;

        setFollowingSet((prev) => new Set(prev).add(userId));
      }
      onFollowToggled?.();
    } catch (err: any) {
      alert(`Follow action failed: ${err?.message || 'Network error'}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-threads-surface border border-threads-border rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[80vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-threads-border">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-threads-muted" />
              <h2 className="font-semibold text-threads-text tracking-tight">
                @{targetProfile.username}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-threads-muted hover:text-threads-text hover:bg-threads-hover transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Selector */}
          <div className="flex border-b border-threads-border">
            <button
              type="button"
              onClick={() => setActiveTab('followers')}
              className={`flex-1 py-3 text-xs sm:text-sm font-semibold transition border-b-2 ${
                activeTab === 'followers'
                  ? 'border-threads-text text-threads-text'
                  : 'border-transparent text-threads-muted hover:text-threads-text'
              }`}
            >
              Followers ({targetProfile.followers_count})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('following')}
              className={`flex-1 py-3 text-xs sm:text-sm font-semibold transition border-b-2 ${
                activeTab === 'following'
                  ? 'border-threads-text text-threads-text'
                  : 'border-transparent text-threads-muted hover:text-threads-text'
              }`}
            >
              Following ({targetProfile.following_count})
            </button>
          </div>

          {/* List Content */}
          <div className="overflow-y-auto flex-1 p-2 divide-y divide-threads-border/40">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-threads-muted">
                <Loader2 className="w-6 h-6 animate-spin text-threads-muted" />
                <span className="text-xs">Loading connections...</span>
              </div>
            ) : users.length === 0 ? (
              <div className="py-12 text-center text-threads-muted space-y-1">
                <p className="text-sm font-medium">
                  {activeTab === 'followers'
                    ? 'No followers yet'
                    : 'Not following anyone yet'}
                </p>
                <p className="text-xs">
                  {activeTab === 'followers'
                    ? `@${targetProfile.username} has not gained any followers yet.`
                    : `@${targetProfile.username} is not currently following other creators.`}
                </p>
              </div>
            ) : (
              users.map((user) => {
                const isViewer = currentViewerId === user.id;
                const isUserFollowing = followingSet.has(user.id);
                const isLoading = actionLoading === user.id;

                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-2xl hover:bg-threads-hover/60 transition gap-3"
                  >
                    <Link
                      href={`/profile/${user.username}`}
                      onClick={onClose}
                      className="flex items-center gap-3 min-w-0 flex-1"
                    >
                      <div className="w-10 h-10 rounded-full bg-threads-elevated border border-threads-border overflow-hidden flex items-center justify-center text-sm font-bold shrink-0">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          (user.username[0] || 'U').toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-semibold truncate hover:underline">
                            {user.full_name || user.username}
                          </span>
                          {user.is_verified && (
                            <BadgeCheck className="w-3.5 h-3.5 text-emerald-400 fill-emerald-500/10 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-threads-muted truncate">
                          @{user.username}
                        </p>
                        {user.bio && (
                          <p className="text-xs text-threads-muted/80 truncate mt-0.5">
                            {user.bio}
                          </p>
                        )}
                      </div>
                    </Link>

                    {/* Follow Action Button */}
                    {currentViewerId && !isViewer && (
                      <button
                        type="button"
                        onClick={() => handleToggleFollow(user.id)}
                        disabled={isLoading}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition shrink-0 flex items-center gap-1.5 ${
                          isUserFollowing
                            ? 'border border-threads-border text-threads-muted hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10'
                            : 'bg-threads-text text-threads-bg hover:opacity-90'
                        }`}
                      >
                        {isLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : isUserFollowing ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            Following
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-3.5 h-3.5" />
                            Follow
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
