'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { executeDsa } from '@/lib/dsa';
import { useDsaInspector } from '@/context/dsa-inspector-context';
import { AppShell } from '@/components/layout/AppShell';
import { PostCard } from '@/components/threads/PostCard';
import { FeedSkeleton } from '@/components/threads/FeedSkeleton';
import { ReplyModal } from '@/components/threads/ReplyModal';
import { ImageLightbox } from '@/components/threads/ImageLightbox';
import type { FlattenedTreeNode, Post, Profile } from '@/types/database';

export default function ThreadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { recordTelemetry } = useDsaInspector();

  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [postMap, setPostMap] = useState<Map<string, Post>>(new Map());
  const [treeNodes, setTreeNodes] = useState<FlattenedTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyTarget, setReplyTarget] = useState<Post | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const loadThread = useCallback(async () => {
    if (!params?.id) return;
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
        if (prof) setCurrentProfile(prof as Profile);
      }

      const { data: rows } = await supabase
        .from('posts')
        .select('*, author:profiles!author_id(*)')
        .or(`id.eq.${params.id},root_id.eq.${params.id}`)
        .order('created_at', { ascending: true });

      const allRows = (rows ?? []) as Post[];
      if (allRows.length === 0) {
        setTreeNodes([]);
        return;
      }

      // Check if root post author is blocked
      const rootPost = allRows.find((p) => p.id === params.id);
      if (rootPost?.author?.is_blocked) {
        setTreeNodes([]);
        setPostMap(new Map());
        return;
      }

      // Filter out any replies from blocked users
      const hydrated = allRows.filter((p) => !p.author?.is_blocked);
      setPostMap(new Map(hydrated.map((p) => [p.id, p])));

      const res = await executeDsa<{ nodes: FlattenedTreeNode[] }>(
        'reply_tree',
        {
          root_id: params.id,
          posts: hydrated.map((p) => ({
            id: p.id,
            parent_id: p.parent_id ?? '',
            author_username: p.author?.username ?? '',
            content: p.content,
            created_at: p.created_at,
          })),
        },
        recordTelemetry
      );

      if (res.ok && Array.isArray(res.nodes)) {
        setTreeNodes(res.nodes);
      } else {
        // Fallback flat ordering if DFS tree returns empty
        setTreeNodes(
          hydrated.map((p, idx) => ({
            id: p.id,
            parent_id: p.parent_id ?? '',
            depth: p.id === params.id ? 0 : 1,
            child_count: 0,
            has_next_sibling: idx < hydrated.length - 1,
            ancestor_has_next: [],
            dfs_order: idx,
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, [params?.id, recordTelemetry]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  return (
    <AppShell
      title="Thread"
      headerRight={
        <button
          type="button"
          onClick={() => router.back()}
          className="p-1.5 rounded-full text-threads-muted hover:text-threads-text hover:bg-threads-hover"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
      }
    >
      {loading ? (
        <FeedSkeleton count={3} />
      ) : treeNodes.length === 0 ? (
        <div className="p-10 text-center text-sm text-threads-muted">
          Thread not found.
        </div>
      ) : (
        <div className="divide-y divide-threads-border/60">
          {treeNodes.map((node) => {
            const post = postMap.get(node.id);
            if (!post) return null;
            const indentPx = Math.min(node.depth, 4) * 28;
            return (
              <div
                key={node.id}
                style={{ paddingLeft: indentPx }}
                className="relative"
              >
                {node.depth > 0 && (
                  <div
                    style={{ left: indentPx - 12 }}
                    className="absolute top-0 bottom-0 w-[2px] bg-threads-border/80"
                  />
                )}
                <PostCard
                  post={post}
                  currentProfile={currentProfile}
                  showConnectorBelow={node.child_count > 0}
                  onReplyClick={setReplyTarget}
                  onImageClick={setLightboxUrl}
                  onMutated={loadThread}
                />
              </div>
            );
          })}
        </div>
      )}

      <ReplyModal
        parentPost={replyTarget}
        currentProfile={currentProfile}
        onClose={() => setReplyTarget(null)}
        onReplied={loadThread}
      />
      <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
    </AppShell>
  );
}
