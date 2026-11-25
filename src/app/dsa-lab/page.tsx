'use client';

import React, { useState } from 'react';
import { Cpu, FlaskConical, Play } from 'lucide-react';
import { executeDsa } from '@/lib/dsa';
import { useDsaInspector } from '@/context/dsa-inspector-context';
import { AppShell } from '@/components/layout/AppShell';
import type { DsaTelemetry } from '@/types/database';

interface BenchResult {
  title: string;
  meta: DsaTelemetry;
  summary: string;
}

/**
 * Strictly Isolated In-Memory DSA Benchmark Lab (/dsa-lab)
 * ---------------------------------------------------------------------------
 * Generates ephemeral synthetic benchmark payloads purely in browser memory
 * to stress-test all 5 C++17 data structures (500-2,000 items) WITHOUT ever
 * writing a single row to Supabase.
 */
export default function DsaLabPage() {
  const { recordTelemetry, openDrawer } = useDsaInspector();
  const [scale, setScale] = useState<number>(500);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BenchResult[]>([]);

  const runAllBenchmarks = async () => {
    setRunning(true);
    const out: BenchResult[] = [];

    try {
      // 1. Max-Heap Feed Ranking (N posts, Top K = 25)
      const syntheticPosts = Array.from({ length: scale }, (_, i) => ({
        id: `mem_post_${i}`,
        likes: (i * 17) % 250,
        replies: (i * 7) % 60,
        hours_old: Number(((i % 72) + 0.5).toFixed(2)),
      }));
      const feedRes = await executeDsa<{ ranked: Array<{ id: string; score: number }> }>(
        'rank_feed',
        { posts: syntheticPosts, top_k: 25 },
        recordTelemetry
      );
      out.push({
        title: `FeedHeap Top-25 Ranking (N=${scale})`,
        meta: feedRes.meta,
        summary: `Top post: ${feedRes.ranked?.[0]?.id} (score=${feedRes.ranked?.[0]?.score})`,
      });

      // 2. Trie + KMP Search
      const tokens = Array.from({ length: scale }, (_, i) =>
        i % 2 === 0 ? `@dev_user_${i}` : `#dsa_topic_${i}`
      );
      const textPosts = Array.from({ length: scale }, (_, i) => ({
        id: `mem_post_${i}`,
        author_username: `dev_user_${i}`,
        content:
          i % 15 === 0
            ? `Benchmarking C++17 WebAssembly Trie & KMP substring search #dsa_topic_${i}`
            : `Standard benchmark payload entry number ${i}`,
      }));
      const searchRes = await executeDsa<{
        suggestions: string[];
        matches: Array<{ post_id: string }>;
      }>(
        'search',
        { tokens, posts: textPosts, query: 'WebAssembly', limit: 10 },
        recordTelemetry
      );
      out.push({
        title: `Trie + KMP Search (${scale} tokens + ${scale} posts)`,
        meta: searchRes.meta,
        summary: `KMP matches: ${searchRes.matches?.length ?? 0} | Trie suggestions: ${searchRes.suggestions?.length ?? 0}`,
      });

      // 3. N-ary Reply Tree DFS
      const treePosts = Array.from({ length: Math.min(scale, 400) }, (_, i) => ({
        id: `node_${i}`,
        parent_id: i === 0 ? '' : `node_${Math.floor((i - 1) / 3)}`,
        author_username: `user_${i}`,
        content: `Reply node ${i}`,
        created_at: new Date().toISOString(),
      }));
      const treeRes = await executeDsa<{ nodes: unknown[]; max_depth: number }>(
        'reply_tree',
        { root_id: 'node_0', posts: treePosts },
        recordTelemetry
      );
      out.push({
        title: `N-ary ReplyTree DFS (${treePosts.length} nodes)`,
        meta: treeRes.meta,
        summary: `Traversed ${treeRes.nodes?.length ?? 0} nodes · Max depth = ${treeRes.max_depth}`,
      });

      // 4. Directed Social Graph 2-Hop BFS
      const edges: Array<{ follower_id: string; following_id: string }> = [];
      const userCount = Math.min(scale, 300);
      for (let i = 0; i < userCount; i++) {
        edges.push({ follower_id: `u_${i}`, following_id: `u_${(i + 1) % userCount}` });
        edges.push({ follower_id: `u_${i}`, following_id: `u_${(i + 3) % userCount}` });
        edges.push({ follower_id: `u_${i}`, following_id: `u_${(i + 7) % userCount}` });
      }
      const graphRes = await executeDsa<{
        mutuals: string[];
        recommendations: Array<{ user_id: string; mutual_count: number }>;
      }>(
        'social_graph',
        { edges, user_id: 'u_0', target_user_id: 'u_1', limit: 5 },
        recordTelemetry
      );
      out.push({
        title: `Directed SocialGraph BFS (V=${userCount}, E=${edges.length})`,
        meta: graphRes.meta,
        summary: `Recommendations: ${graphRes.recommendations?.length ?? 0} | Mutuals: ${graphRes.mutuals?.length ?? 0}`,
      });

      // 5. FIFO Activity Queue
      const notifications = Array.from({ length: scale }, (_, i) => ({
        id: `notif_${i}`,
        type: i % 2 === 0 ? 'like' : 'reply',
        actor_id: `u_${i}`,
        post_id: `p_${i}`,
        created_at: new Date().toISOString(),
        is_read: false,
      }));
      const queueRes = await executeDsa<{ ordered: unknown[] }>(
        'activity_queue',
        { items: notifications },
        recordTelemetry
      );
      out.push({
        title: `FIFO ActivityQueue (${scale} notifications)`,
        meta: queueRes.meta,
        summary: `Drained ${queueRes.ordered?.length ?? 0} notifications in strict FIFO order`,
      });

      setResults(out);
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppShell
      title="DSA Benchmark Lab"
      headerRight={
        <button
          type="button"
          onClick={openDrawer}
          className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-medium text-emerald-400 flex items-center gap-1"
        >
          <Cpu className="w-3.5 h-3.5" />
          Inspector
        </button>
      }
    >
      <div className="p-5 space-y-5">
        <div className="rounded-2xl bg-threads-bg border border-threads-border p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="w-4 h-4 text-emerald-400" />
            Isolated In-Memory Stress Test (Zero Database Writes)
          </div>
          <p className="text-xs text-threads-muted leading-relaxed">
            Benchmarks all 5 C++17 data structures (FeedHeap, Trie+KMP, ReplyTree, SocialGraph BFS, ActivityQueue) using ephemeral in-memory data. Never writes to Supabase.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-threads-muted">Dataset Size (N):</span>
              {[100, 500, 1500].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScale(n)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition ${
                    scale === n
                      ? 'bg-threads-text text-threads-bg border-threads-text'
                      : 'border-threads-border text-threads-muted hover:text-threads-text'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={runAllBenchmarks}
              disabled={running}
              className="ml-auto px-4 py-2 rounded-xl bg-emerald-500 text-black text-xs font-semibold hover:bg-emerald-400 disabled:opacity-50 transition flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              {running ? 'Running...' : 'Run All 5 DSA Benchmarks'}
            </button>
          </div>
        </div>

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((r) => (
              <div
                key={r.title}
                className="rounded-2xl bg-threads-bg border border-threads-border p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{r.title}</span>
                  <span className="font-mono text-xs text-emerald-400">
                    {r.meta.execution_time_ms.toFixed(3)} ms
                  </span>
                </div>
                <div className="text-xs text-threads-muted">{r.summary}</div>
                <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-threads-surface border border-threads-border text-amber-400">
                    Time: {r.meta.time_complexity}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-threads-surface border border-threads-border text-sky-400">
                    Space: {r.meta.space_complexity}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-threads-surface border border-threads-border text-threads-muted">
                    {r.meta.runtime}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
