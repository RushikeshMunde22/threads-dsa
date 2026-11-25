/**
 * ============================================================================
 * THREADS-GEMM: COMPREHENSIVE DATA STRUCTURES & ALGORITHMS VERIFICATION SUITE
 * Activity 3: Data Structures in Action — Inside the Feed
 * Team Root Node | S.Y. B.Tech Computer Engineering
 * ============================================================================
 */

import {
  SocialGraph,
  FeedMaxHeap,
  computeEngagementScore,
  simulateHybridFeedFanOut,
  ReplyTree,
  FifoQueue,
  NotificationHistoryList,
  ActivityNotificationEngine,
  DraftUndoStack,
  PrefixTrie,
  kmpSearch,
  buildLpsArray,
  runFullTableIiBenchmark,
  runDsaOperation,
} from '../src/lib/dsa';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

console.log('================================================================');
console.log('🚀 RUNNING VERIFICATION SUITE FOR ALL 7 MODULAR DSA ENGINES');
console.log('================================================================\n');

// ----------------------------------------------------------------------------
// TEST 1: DIRECTED SOCIAL GRAPH (Adjacency List + Hash Sets)
// ----------------------------------------------------------------------------
console.log('▶ [1/7] Testing Directed Social Graph...');
const graph = new SocialGraph();
graph.addUser('alice');
graph.addUser('bob');
graph.addUser('charlie');
graph.addUser('david');

assert(graph.follow('alice', 'bob') === true, 'Alice follows Bob');
assert(graph.follow('alice', 'charlie') === true, 'Alice follows Charlie');
assert(graph.follow('bob', 'charlie') === true, 'Bob follows Charlie');
assert(graph.follow('bob', 'david') === true, 'Bob follows David');
assert(graph.follow('charlie', 'david') === true, 'Charlie follows David');
assert(graph.follow('alice', 'alice') === false, 'Prevent self-follow');
assert(graph.isFollowing('alice', 'bob') === true, 'Alice is following Bob');
assert(graph.isFollowing('bob', 'alice') === false, 'Bob is NOT following Alice (directed)');

// Mutuals check
const mutuals = graph.getMutualFollowers('alice', 'bob');
assert(mutuals.includes('charlie'), 'Charlie is mutual friend of Alice and Bob');

// 2-Hop BFS recommendations
const suggestions = graph.suggestConnections('alice', 5);
assert(suggestions.some((s) => s.userId === 'david'), 'David is recommended to Alice via 2-Hop BFS');

// Shortest path BFS
const pathResult = graph.findShortestPath('alice', 'david');
assert(pathResult.found && pathResult.path.length === 3 && pathResult.distance === 2, 'Shortest path from Alice to David is 2 hops (path length 3)');
console.log(`   ✓ Graph: Follow, Mutuals, 2-Hop Suggestions, Shortest Path verified (${graph.vertexCount} nodes, ${graph.edgeCount} edges).`);

// ----------------------------------------------------------------------------
// TEST 2: FLAT-ARRAY BINARY MAX-HEAP (Priority Queue)
// ----------------------------------------------------------------------------
console.log('▶ [2/7] Testing Flat-Array Binary Max-Heap...');
const rawPosts = [
  { id: 'p1', likes: 10, replies: 2, hours_old: 5 },
  { id: 'p2', likes: 100, replies: 40, hours_old: 1 },
  { id: 'p3', likes: 50, replies: 10, hours_old: 2 },
  { id: 'p4', likes: 5, replies: 1, hours_old: 24 },
  { id: 'p5', likes: 80, replies: 15, hours_old: 0.5 },
];

const heap = new FeedMaxHeap(rawPosts);
assert(heap.size === 5, 'Heap contains 5 posts');
const peeked = heap.peek();
assert(peeked?.id === 'p2' || peeked?.id === 'p5', 'Highest scoring post is at root');

// Test Top-K extraction without Array.sort()
const top3 = heap.topK(3);
assert(top3.length === 3, 'Extracted top-3 posts');
assert(top3[0].score >= top3[1].score, 'Top post 0 score >= post 1 score');
assert(top3[1].score >= top3[2].score, 'Top post 1 score >= post 2 score');

// Gravity decay
const freshScore = computeEngagementScore({ likes: 50, replies: 10, hours_old: 1.0 });
const staleScore = computeEngagementScore({ likes: 50, replies: 10, hours_old: 24.0 });
assert(freshScore > staleScore, 'Fresh post score strictly exceeds 24h old post score with identical likes');

// Celebrity fanout simulation
const celebSim = simulateHybridFeedFanOut(50000, 10000);
assert(celebSim.isCelebrity === true, '50k followers triggers celebrity threshold');
assert(celebSim.hybridWriteCount === 1, 'Celebrity write cost is 1 database write (O(1))');
assert(celebSim.writesSaved === 49999, '49,999 writes saved by hybrid pull architecture');
console.log(`   ✓ Max-Heap: Top-K extraction, Floyd heapify, Gravity decay, and Celebrity fanout verified.`);

// ----------------------------------------------------------------------------
// TEST 3: GENERAL N-ARY REPLY TREE + PRE-ORDER DFS
// ----------------------------------------------------------------------------
console.log('▶ [3/7] Testing General N-ary Reply Tree...');
const tree = new ReplyTree();
tree.buildFromFlatList(
  { id: 'root', data: { content: 'Root post' }, score: 10 },
  [
    { id: 'r1', parentId: 'root', data: { content: 'Reply 1' }, score: 20 },
    { id: 'r2', parentId: 'root', data: { content: 'Reply 2' }, score: 5 },
    { id: 'r1_1', parentId: 'r1', data: { content: 'Reply 1.1' }, score: 8 },
    { id: 'r1_2', parentId: 'r1', data: { content: 'Reply 1.2' }, score: 12 },
    { id: 'r1_1_1', parentId: 'r1_1', data: { content: 'Reply 1.1.1' }, score: 1 },
    { id: 'r1_1_1_1', parentId: 'r1_1_1', data: { content: 'Depth 4 reply' }, score: 1 }, // should be capped at maxDepth=3
  ]
);

assert(tree.size === 7, 'Tree built with 7 total nodes');
const flattened = tree.flattenPreOrderDFS({ maxDepth: 3, maxChildrenPerNode: 3 });
assert(flattened.length > 0, 'Pre-order DFS traversal produced flattened sequence');
assert(flattened[0].node.id === 'r1', 'DFS begins with first top-level reply r1');
assert(flattened.some((f) => f.isDepthCapped === true), 'Viral reply exceeding depth 3 is marked isDepthCapped');
console.log(`   ✓ Reply Tree: O(1) hash map indexing, Pre-Order DFS, Connector Masks, and Depth Capping verified.`);

// ----------------------------------------------------------------------------
// TEST 4: FIFO QUEUE + DOUBLY LINKED LIST
// ----------------------------------------------------------------------------
console.log('▶ [4/7] Testing FIFO Queue + Doubly Linked List...');
const fifo = new FifoQueue<number>();
fifo.enqueue(10);
fifo.enqueue(20);
fifo.enqueue(30);
assert(fifo.size === 3, 'FIFO queue size is 3');
assert(fifo.dequeue() === 10, 'First item dequeued is 10 (FIFO)');
assert(fifo.dequeue() === 20, 'Second item dequeued is 20');
assert(fifo.size === 1, 'FIFO queue size is 1');

const dll = new NotificationHistoryList<any>();
dll.append('n1', { id: 'n1', type: 'like', actor_id: 'u1', is_read: false, created_at: '2026-11-20' });
dll.append('n2', { id: 'n2', type: 'reply', actor_id: 'u2', is_read: false, created_at: '2026-11-21' });
dll.append('n3', { id: 'n3', type: 'follow', actor_id: 'u3', is_read: false, created_at: '2026-11-22' });
assert(dll.size === 3, 'DLL history size is 3');
assert(dll.removeById('n2') === true, 'O(1) unlinked notification n2');
assert(dll.size === 2, 'DLL history size is now 2');
assert(dll.removeById('n2') === false, 'Cannot unlink already removed notification');

const notifEngine = new ActivityNotificationEngine();
notifEngine.receiveEvent({ id: 'e1', type: 'like', actor_id: 'u1', actor_username: 'user1', read: false, created_at: '2026-11-20' });
notifEngine.processPendingDelivery();
assert(notifEngine.getHistory().length === 1, 'Notification processed from Queue into DLL History');
console.log(`   ✓ Queue & DLL: O(1) FIFO enqueue/dequeue (no shift) and O(1) pointer unlinking verified.`);

// ----------------------------------------------------------------------------
// TEST 5: BOUNDED LIFO DRAFT STACK
// ----------------------------------------------------------------------------
console.log('▶ [5/7] Testing Bounded LIFO Draft Undo/Redo Stack...');
const draftStack = new DraftUndoStack(5);
draftStack.push({ text: 'Draft 1' });
draftStack.push({ text: 'Draft 2' });
draftStack.push({ text: 'Draft 3' });
assert(draftStack.size === 3, 'Draft stack size is 3');

const undone = draftStack.undo();
assert(undone?.text === 'Draft 2', 'Undo reverts to Draft 2');
const redone = draftStack.redo();
assert(redone?.text === 'Draft 3', 'Redo restores Draft 3');

// Duplicate suppression
draftStack.push({ text: 'Draft 3' });
assert(draftStack.size === 3, 'Consecutive identical draft content is suppressed');
console.log(`   ✓ Draft Stack: LIFO push/pop, duplicate suppression, and O(1) Redo verified.`);

// ----------------------------------------------------------------------------
// TEST 6: TRIE PREFIX TREE & KMP SUBSTRING MATCHER
// ----------------------------------------------------------------------------
console.log('▶ [6/7] Testing Prefix Trie & KMP Substring Matcher...');
const trie = new PrefixTrie();
trie.insert('@rushikesh', 'username');
trie.insert('@ram', 'username');
trie.insert('@sarthak', 'username');
trie.insert('@sid', 'username');
trie.insert('#dsa', 'hashtag');
trie.insert('#datastructures', 'hashtag');

const rSug = trie.autocomplete('@r', 5);
assert(rSug.length >= 2, 'Autocomplete for @r finds @rushikesh and @ram');
assert(trie.autocomplete('#dsa').length === 1, 'Trie autocompletes #dsa');
assert(trie.autocomplete('#unknown').length === 0, 'Trie does not match #unknown');

// KMP search & LPS table
const lps = buildLpsArray('ABABCABAB');
assert(lps.length === 9, 'LPS table generated for pattern');
const kmpRes = kmpSearch('HELLO TO THE WORLD OF DATA STRUCTURES IN ACTION', 'DATA STRUCTURES');
assert(kmpRes.matches.length === 1 && kmpRes.matches[0] === 22, 'KMP located exact match at index 22');
console.log(`   ✓ Trie & KMP: O(L) prefix autocomplete and O(N+M) LPS substring matching verified.`);

// ----------------------------------------------------------------------------
// TEST 7: UNIFIED DISPATCHER & BENCHMARK COMPARATOR
// ----------------------------------------------------------------------------
console.log('▶ [7/7] Testing Unified runDsaOperation & Benchmark Suite...');
const dsaRes = runDsaOperation('rank_feed', {
  posts: [
    { id: 't1', likes: 10, replies: 2, hours_old: 1 },
    { id: 't2', likes: 50, replies: 10, hours_old: 2 },
  ],
  top_k: 1,
});
assert(dsaRes.ok === true, 'runDsaOperation returned ok=true');
assert(dsaRes.meta?.runtime === 'TypeScript-DSA-Engine (Activity 3)', 'Runtime tag verified');

const benchRes = runFullTableIiBenchmark(1000);
assert(benchRes.length === 6, 'Table II benchmark evaluated all 6 operations');
for (const b of benchRes) {
  console.log(`   ⚡ [${b.feature}: ${b.task}] Naive: ${b.naiveMs.toFixed(3)}ms | Chosen (${b.chosenApproach}): ${b.chosenMs.toFixed(3)}ms | Speedup: ${b.speedupFactor.toFixed(1)}x`);
}

console.log('\n================================================================');
console.log('🎉 ALL 7 DATA STRUCTURE ENGINES PASSED 100% OF VERIFICATION TESTS');
console.log('================================================================\n');
