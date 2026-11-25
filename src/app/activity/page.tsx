'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCheck, Heart, MessageCircle, Repeat2, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { executeDsa } from '@/lib/dsa';
import { useDsaInspector } from '@/context/dsa-inspector-context';
import { AppShell } from '@/components/layout/AppShell';
import { FeedSkeleton } from '@/components/threads/FeedSkeleton';
import type { NotificationItem } from '@/types/database';

export default function ActivityPage() {
  const { recordTelemetry } = useDsaInspector();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('notifications')
        .select(
          `*,
           actor:profiles!notifications_actor_id_fkey(*),
           post:posts(id, content, root_id)`
        )
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: true })
        .limit(100);

      const raw = (data ?? []) as NotificationItem[];
      if (raw.length === 0) {
        setItems([]);
        return;
      }

      const res = await executeDsa<{
        ordered: Array<{ id: string }>;
      }>(
        'activity_queue',
        {
          items: raw.map((n) => ({
            id: n.id,
            type: n.type,
            actor_id: n.actor_id,
            post_id: n.post_id ?? '',
            created_at: n.created_at,
            is_read: n.is_read,
          })),
        },
        recordTelemetry
      );

      if (res.ok && Array.isArray(res.ordered)) {
        const map = new Map(raw.map((n) => [n.id, n]));
        const fifo = res.ordered
          .map((o) => map.get(o.id))
          .filter((n): n is NotificationItem => Boolean(n));
        // Display newest-dispatched at top while preserving FIFO dispatch order telemetry
        setItems(fifo.reverse());
      } else {
        setItems(raw.reverse());
      }
    } finally {
      setLoading(false);
    }
  }, [recordTelemetry]);

  useEffect(() => {
    loadNotifications();

    const supabase = createClient();
    const channel = supabase
      .channel('realtime-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadNotifications]);

  const handleMarkAllRead = async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false);
    setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
  };

  const renderBadge = (type: NotificationItem['type']) => {
    switch (type) {
      case 'like':
        return <Heart className="w-3.5 h-3.5 text-rose-500" fill="currentColor" />;
      case 'reply':
        return <MessageCircle className="w-3.5 h-3.5 text-sky-400" />;
      case 'repost':
        return <Repeat2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'follow':
        return <UserPlus className="w-3.5 h-3.5 text-violet-400" />;
    }
  };

  const labelFor = (type: NotificationItem['type']) => {
    switch (type) {
      case 'like':
        return 'liked your thread';
      case 'reply':
        return 'replied to you';
      case 'repost':
        return 'reposted your thread';
      case 'follow':
        return 'followed you';
    }
  };

  return (
    <AppShell
      title="Activity"
      headerRight={
        items.some((i) => !i.is_read) ? (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="text-xs text-threads-muted hover:text-threads-text flex items-center gap-1"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Read all
          </button>
        ) : null
      }
    >
      {loading ? (
        <FeedSkeleton count={4} />
      ) : items.length === 0 ? (
        <div className="p-12 text-center text-xs text-threads-muted">
          No notifications yet. Likes, replies, reposts, and follows appear here in real time via FIFO Queue dispatch.
        </div>
      ) : (
        <div className="divide-y divide-threads-border">
          {items.map((n) => (
            <div
              key={n.id}
              className={`px-4 py-3.5 flex items-start gap-3 ${
                n.is_read ? '' : 'bg-threads-elevated/40'
              }`}
            >
              <div className="relative shrink-0">
                <Link
                  href={n.actor ? `/profile/${n.actor.username}` : '#'}
                  className="w-9 h-9 rounded-full bg-threads-elevated border border-threads-border overflow-hidden flex items-center justify-center text-xs font-semibold"
                >
                  {n.actor?.avatar_url ? (
                    <img
                      src={n.actor.avatar_url}
                      alt={n.actor.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (n.actor?.username?.[0] ?? '?').toUpperCase()
                  )}
                </Link>
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-threads-surface border border-threads-border flex items-center justify-center">
                  {renderBadge(n.type)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <Link
                    href={n.actor ? `/profile/${n.actor.username}` : '#'}
                    className="font-semibold hover:underline"
                  >
                    {n.actor?.username ?? 'Someone'}
                  </Link>{' '}
                  <span className="text-threads-muted">{labelFor(n.type)}</span>
                </div>
                {n.post && (
                  <Link
                    href={`/thread/${n.post.root_id ?? n.post.id}`}
                    className="block mt-1 text-xs text-threads-muted truncate hover:text-threads-text"
                  >
                    {n.post.content}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
