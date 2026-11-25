/**
 * ============================================================================
 * CENTRAL DSA ENGINE ENTRY POINT & BARREL EXPORT
 * Activity 2 Technical Paper & Activity 3 Working Prototype
 * ============================================================================
 * Exports all modular, zero-dependency, textbook-quality TypeScript data
 * structures and algorithms, along with a unified execution dispatcher
 * providing microsecond telemetry.
 * ============================================================================
 */

import type { DsaTelemetry } from '@/types/database';

export * from './socialGraph';
export * from './feedHeap';
export * from './replyTree';
export * from './activityQueue';
export * from './draftStack';
export * from './searchEngine';
export * from './benchmarks';

import { SocialGraph } from './socialGraph';
import { FeedMaxHeap, computeEngagementScore, simulateHybridFeedFanOut, type CandidatePost } from './feedHeap';
import { ReplyTree } from './replyTree';
import { ActivityNotificationEngine, type NotificationItem } from './activityQueue';
import { DraftUndoStack } from './draftStack';
import { PrefixTrie, kmpSearch } from './searchEngine';
import { runFullTableIiBenchmark } from './benchmarks';

export type SupportedDsaOperation =
  | 'rank_feed'
  | 'search'
  | 'reply_tree'
  | 'social_graph'
  | 'activity_queue'
  | 'draft_stack'
  | 'run_benchmarks'
  | 'simulate_celebrity_fanout';

export interface DsaExecutionResult<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  meta: DsaTelemetry;
  data?: T;
  [key: string]: unknown;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function buildTelemetry(
  ms: number,
  data_structure: string,
  time_complexity: string,
  space_complexity: string,
  action: string,
  item_count: number
): DsaTelemetry {
  return {
    execution_time_ms: Number(ms.toFixed(4)),
    data_structure,
    time_complexity,
    space_complexity,
    action,
    item_count,
    runtime: 'TypeScript-DSA-Engine (Activity 3)',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Unified In-Process Algorithmic Dispatcher.
 * Executes any DSA operation in-process and returns results with precision telemetry.
 */
export function runDsaOperation(
  operation: SupportedDsaOperation | string,
  payload: Record<string, any> = {}
): DsaExecutionResult {
  const t0 = nowMs();

  switch (operation) {
    // ------------------------------------------------------------------------
    // 1. FOR YOU FEED: Bounded Max-Heap Ranking
    // ------------------------------------------------------------------------
    case 'rank_feed': {
      const posts: CandidatePost[] = payload.posts ?? [];
      const topK = payload.top_k ?? 50;

      const heap = new FeedMaxHeap(posts);
      const ranked = heap.topK(topK);

      const ms = nowMs() - t0;
      return {
        ok: true,
        ranked: ranked.map((r) => ({
          id: r.id,
          score: r.score,
          likes: r.likes,
          replies: r.replies,
          hours_old: r.hours_old,
        })),
        meta: buildTelemetry(
          ms,
          'Flat-Array Binary Max-Heap (FeedHeap)',
          'O(N log K)',
          'O(K) bounded array',
          'Feed Rank',
          posts.length
        ),
      };
    }

    // ------------------------------------------------------------------------
    // 2. SEARCH: Trie Autocomplete + KMP Substring Matcher
    // ------------------------------------------------------------------------
    case 'search': {
      const query = String(payload.query ?? '').trim();
      const tokens: string[] = payload.tokens ?? [];
      const posts: Array<{ id: string; author_username?: string; content?: string }> = payload.posts ?? [];

      const trie = new PrefixTrie();
      for (const t of tokens) {
        const type = t.startsWith('@') ? 'username' : t.startsWith('#') ? 'hashtag' : 'keyword';
        trie.insert(t, type);
      }

      // Autocomplete via Trie
      const suggestions = query ? trie.autocomplete(query, 10).map((m) => m.word) : [];

      // Content search via KMP
      const matches: Array<{ id: string; post_id: string; author: string; match_index: number }> = [];
      if (query.length > 0) {
        for (const p of posts) {
          const content = p.content ?? '';
          const author = p.author_username ?? '';
          const kmpRes = kmpSearch(content, query);
          if (kmpRes.matches.length > 0) {
            matches.push({ id: p.id, post_id: p.id, author, match_index: kmpRes.matches[0] });
          } else if (author.toLowerCase().includes(query.toLowerCase())) {
            matches.push({ id: p.id, post_id: p.id, author, match_index: 0 });
          }
        }
      }

      const ms = nowMs() - t0;
      return {
        ok: true,
        suggestions,
        matches,
        meta: buildTelemetry(
          ms,
          'Trie Prefix Tree + KMP Substring Matcher',
          'O(L) Trie / O(N + M) KMP',
          'O(Sigma * L + M)',
          'Search',
          tokens.length + posts.length
        ),
      };
    }

    // ------------------------------------------------------------------------
    // 3. REPLY CONVERSATIONS: General N-ary Tree + Hash Map + Pre-Order DFS
    // ------------------------------------------------------------------------
    case 'reply_tree': {
      let rootPost = payload.root_post;
      let replies = payload.replies;

      if (!rootPost && Array.isArray(payload.posts)) {
        const rootId = payload.root_id;
        rootPost =
          payload.posts.find((p: any) => p.id === rootId) ??
          payload.posts[0] ?? { id: rootId || 'root', data: {} };
        replies = payload.posts.filter((p: any) => p.id !== rootPost.id);
      }

      rootPost = rootPost ?? { id: 'root', data: {} };
      replies = replies ?? [];
      const maxDepth = payload.max_depth ?? 3;
      const maxChildrenPerNode = payload.max_children_per_node ?? 5;

      const tree = new ReplyTree();
      tree.buildFromFlatList(
        { id: rootPost.id, data: rootPost, score: rootPost.score ?? rootPost.likes_count ?? 0 },
        replies.map((r: any) => ({
          id: r.id,
          parentId: r.parent_id ?? r.parentId,
          data: r,
          score: r.likes_count ?? r.score ?? 0,
        }))
      );

      const flattened = tree.flattenPreOrderDFS({ maxDepth, maxChildrenPerNode });
      const mappedNodes = flattened.map((f, idx) => ({
        id: f.node.id,
        parent_id: f.node.parentId,
        depth: f.depth,
        is_last_child: f.isLastChild,
        connector_mask: f.connectorMask,
        hidden_children_count: f.hiddenChildrenCount,
        is_depth_capped: f.isDepthCapped,
        dfs_order: idx,
        data: f.node.data,
      }));

      const ms = nowMs() - t0;
      return {
        ok: true,
        tree: mappedNodes,
        nodes: mappedNodes,
        total_nodes: tree.size,
        max_depth: maxDepth,
        meta: buildTelemetry(
          ms,
          'General N-ary Tree + ID Hash Map (Pre-Order DFS)',
          'O(M) tree build & traversal, O(1) parent attach',
          'O(M) nodes',
          'Reply Tree',
          tree.size
        ),
      };
    }

    // ------------------------------------------------------------------------
    // 4. SOCIAL GRAPH: Adjacency List + Mutuals + 2-Hop BFS + Shortest Path
    // ------------------------------------------------------------------------
    case 'social_graph': {
      const edges: Array<{ follower_id: string; following_id: string }> = payload.edges ?? [];
      const currentUserId = String(payload.current_user_id ?? payload.user_id ?? '');
      const targetUserId = payload.target_user_id ? String(payload.target_user_id) : undefined;

      const graph = new SocialGraph();
      for (const e of edges) {
        graph.follow(e.follower_id, e.following_id);
      }

      const isFollowing = targetUserId ? graph.isFollowing(currentUserId, targetUserId) : false;
      const followers = currentUserId ? graph.getFollowers(currentUserId) : [];
      const following = currentUserId ? graph.getFollowing(currentUserId) : [];
      const mutuals = targetUserId ? graph.getMutualFollowers(currentUserId, targetUserId) : [];
      const suggestions = currentUserId ? graph.suggestConnections(currentUserId, payload.limit ?? 5) : [];
      const shortestPath = targetUserId ? graph.findShortestPath(currentUserId, targetUserId) : null;

      const recommendations = suggestions.map((s) => ({
        user_id: s.userId,
        mutual_count: s.mutualCount,
        mutual_ids: s.mutualIds,
      }));

      const ms = nowMs() - t0;
      return {
        ok: true,
        is_following: isFollowing,
        followers_count: followers.length,
        following_count: following.length,
        mutual_followers: mutuals,
        mutuals,
        mutual_count: mutuals.length,
        suggested_connections: suggestions,
        recommendations,
        shortest_path: shortestPath,
        meta: buildTelemetry(
          ms,
          'Directed Graph (Adjacency List + Hash Sets + 2-Hop BFS)',
          'O(1) avg follow/check, O(V + E) BFS',
          'O(V + E) memory',
          'Social Graph',
          edges.length
        ),
      };
    }

    // ------------------------------------------------------------------------
    // 5. ACTIVITY QUEUE: FIFO Queue + Doubly Linked List
    // ------------------------------------------------------------------------
    case 'activity_queue': {
      const events: NotificationItem[] = payload.events ?? payload.items ?? [];
      const engine = new ActivityNotificationEngine();

      for (const ev of events) {
        engine.receiveEvent(ev);
      }
      engine.processPendingDelivery();

      const history = engine.getHistory(payload.order ?? 'newest_first');

      const ms = nowMs() - t0;
      return {
        ok: true,
        processed_count: events.length,
        history,
        ordered: history,
        meta: buildTelemetry(
          ms,
          'FIFO Queue (Delivery) + Doubly Linked List (History)',
          'O(1) enqueue/dequeue, O(1) unlinking',
          'O(M) nodes',
          'Activity Queue',
          events.length
        ),
      };
    }

    // ------------------------------------------------------------------------
    // 6. COMPOSER UNDO/REDO: Bounded LIFO Stack
    // ------------------------------------------------------------------------
    case 'draft_stack': {
      const stack = new DraftUndoStack(payload.max_capacity ?? 50);
      const history = payload.history ?? payload.snapshots ?? [];

      for (const snap of history) {
        stack.push(snap);
      }

      let popped: any = null;
      if (payload.action === 'undo') {
        popped = stack.undo();
      } else if (payload.action === 'redo') {
        popped = stack.redo();
      } else if (payload.new_snapshot) {
        stack.push(payload.new_snapshot);
      }

      const ms = nowMs() - t0;
      return {
        ok: true,
        popped: popped ?? stack.peek() ?? null,
        current_state: stack.peek(),
        can_undo: stack.canUndo,
        can_redo: stack.canRedo,
        stack_size: stack.size,
        history: stack.getHistory(),
        stack: stack.getHistory(),
        meta: buildTelemetry(
          ms,
          'Bounded LIFO Stack (DraftUndoStack)',
          'O(1) push, pop, undo, redo',
          'O(S) bounded snapshots',
          'Composer Undo',
          stack.size
        ),
      };
    }

    // ------------------------------------------------------------------------
    // 7. BENCHMARK COMPARATOR: Activity 2 Table II Naive vs. Chosen
    // ------------------------------------------------------------------------
    case 'run_benchmarks': {
      const scale = Number(payload.scale ?? 3000);
      const results = runFullTableIiBenchmark(scale);

      const ms = nowMs() - t0;
      return {
        ok: true,
        results,
        meta: buildTelemetry(
          ms,
          'Comparative Benchmark Suite (Activity 2 Table II)',
          'Multiple Big-O bounds',
          'O(N) memory',
          'Benchmark Suite',
          scale
        ),
      };
    }

    // ------------------------------------------------------------------------
    // 8. CELEBRITY BOTTLENECK SIMULATOR: Activity 2 Section IV-A
    // ------------------------------------------------------------------------
    case 'simulate_celebrity_fanout': {
      const followers = Number(payload.follower_count ?? 100000);
      const threshold = Number(payload.threshold ?? 10000);
      const simulation = simulateHybridFeedFanOut(followers, threshold);

      const ms = nowMs() - t0;
      return {
        ok: true,
        simulation,
        meta: buildTelemetry(
          ms,
          'Hybrid Push-Pull Fan-Out Simulator',
          simulation.isCelebrity ? 'O(1) write + O(c log n) read' : 'O(F) push write',
          'O(1) metadata',
          'Celebrity Bottleneck',
          followers
        ),
      };
    }

    default: {
      const ms = nowMs() - t0;
      return {
        ok: false,
        error: `Unsupported DSA operation: ${operation}`,
        meta: buildTelemetry(ms, 'Unknown', 'N/A', 'N/A', 'Error', 0),
      };
    }
  }
}

/**
 * Backwards-compatible asynchronous helper matching the signature used
 * across React client components. Runs in-process with zero network overhead.
 */
export async function executeDsa<T extends Record<string, unknown>>(
  operation: SupportedDsaOperation | string,
  payload: Record<string, any> = {},
  onTelemetry?: (meta: DsaTelemetry) => void
): Promise<T & { ok: boolean; meta: DsaTelemetry }> {
  const result = runDsaOperation(operation, payload);

  if (onTelemetry && result.meta) {
    onTelemetry(result.meta);
  }

  return result as unknown as T & { ok: boolean; meta: DsaTelemetry };
}
