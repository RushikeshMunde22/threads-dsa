/**
 * ============================================================================
 * FEATURE 3: THREADED REPLY CONVERSATIONS — GENERAL N-ARY TREE + HASH MAP
 * Activity 2 Paper: Section II-C & Section IV-B | Activity 3 Rubric: Feature C
 * ============================================================================
 * Architecture: N-ary Tree indexed by an ID-to-Node pointer Hash Map
 * Time Complexity:
 *   - addReply(id, parentId): O(1) average via Hash Map jump + array append
 *   - findNode(id):           O(1) average via Hash Map
 *   - buildFromFlatList():    O(m) linear construction for m replies
 *   - flattenPreOrderDFS():   O(m) traversal to construct linear thread view
 * Space Complexity:           O(m) total nodes and map entries
 *
 * Why this structure?
 * In Threads, replies can be replied to recursively to arbitrary depth.
 * Walking the tree to find where to attach a new reply costs O(m).
 * An ID-to-Node Hash Map eliminates the walk: you jump straight to parent
 * in O(1) time and append the child pointer.
 * Pre-Order DFS traversal guarantees replies appear immediately underneath
 * their parent, and generates connector line metadata for CSS tree branches.
 * ============================================================================
 */

import { FeedMaxHeap, computeEngagementScore, type CandidatePost } from './feedHeap';

export interface ReplyNode<T = Record<string, unknown>> {
  id: string;
  parentId: string | null;
  data: T;
  score: number;
  children: ReplyNode<T>[];
  created_at?: string;
}

export interface FlattenedReply<T = Record<string, unknown>> {
  node: ReplyNode<T>;
  depth: number;
  isLastChild: boolean;
  connectorMask: boolean[]; // Array indicating which ancestor columns have vertical lines
  hiddenChildrenCount: number; // Viral tree mitigation: number of children pruned by top-K / depth cap
  isDepthCapped: boolean; // True if this branch extends deeper than maxDepth
}

export interface ReplyTreeOptions {
  maxDepth?: number; // Depth cap to prevent viral tree freeze (default 3)
  maxChildrenPerNode?: number; // Top-K child ranking cap (default 5 for viral branches)
}

export class ReplyTree<T = Record<string, unknown>> {
  private root: ReplyNode<T> | null = null;

  /** Hash Map indexing every node by its ID for instant O(1) pointer jump */
  private nodeMap: Map<string, ReplyNode<T>> = new Map();

  /**
   * Initializes or sets the root conversation post.
   * Time Complexity: O(1)
   */
  public setRoot(id: string, data: T, score: number = 0): ReplyNode<T> {
    const rootNode: ReplyNode<T> = {
      id,
      parentId: null,
      data,
      score,
      children: [],
    };
    this.root = rootNode;
    this.nodeMap.clear();
    this.nodeMap.set(id, rootNode);
    return rootNode;
  }

  /**
   * Attaches a new reply to its parent post in O(1) time.
   * Uses Hash Map to jump straight to parent pointer without tree walking.
   *
   * Time Complexity: O(1) average
   * Space Complexity: O(1) auxiliary
   */
  public addReply(id: string, parentId: string, data: T, score: number = 0): boolean {
    const parentNode = this.nodeMap.get(parentId);
    if (!parentNode) {
      return false; // Parent not found or orphaned
    }

    // Prevent duplicate node IDs
    if (this.nodeMap.has(id)) {
      return false;
    }

    const newNode: ReplyNode<T> = {
      id,
      parentId,
      data,
      score,
      children: [],
    };

    parentNode.children.push(newNode);
    this.nodeMap.set(id, newNode);
    return true;
  }

  /**
   * Fast O(1) node lookup by ID.
   * Time Complexity: O(1) average
   */
  public findNode(id: string): ReplyNode<T> | null {
    return this.nodeMap.get(id) ?? null;
  }

  /**
   * Constructs the full tree in linear O(m) time from an unordered flat list.
   * Uses an orphan buffer to handle replies that arrive before their parent.
   *
   * Time Complexity: O(m)
   * Space Complexity: O(m)
   */
  public buildFromFlatList(
    rootPost: { id: string; data: T; score?: number },
    flatReplies: Array<{ id: string; parentId: string; data: T; score?: number }>
  ): void {
    this.setRoot(rootPost.id, rootPost.data, rootPost.score ?? 0);

    const orphanMap = new Map<string, Array<{ id: string; parentId: string; data: T; score?: number }>>();

    // Helper to recursively attach any orphans waiting for this parent
    const attachWaitingOrphans = (parentId: string) => {
      const waiting = orphanMap.get(parentId);
      if (!waiting) return;
      orphanMap.delete(parentId);

      for (const item of waiting) {
        this.addReply(item.id, item.parentId, item.data, item.score ?? 0);
        attachWaitingOrphans(item.id);
      }
    };

    for (const reply of flatReplies) {
      if (this.nodeMap.has(reply.parentId)) {
        this.addReply(reply.id, reply.parentId, reply.data, reply.score ?? 0);
        attachWaitingOrphans(reply.id);
      } else {
        const list = orphanMap.get(reply.parentId) ?? [];
        list.push(reply);
        orphanMap.set(reply.parentId, list);
      }
    }
  }

  /**
   * Pre-Order Depth-First Search (DFS) Traversal:
   * Flattens the hierarchy into a linear array ready for screen rendering.
   *
   * Computes:
   *   1. Indentation depth
   *   2. isLastChild flag (to draw curve vs vertical line: "└─" vs "├─")
   *   3. connectorMask array (indicates whether each ancestor column should continue drawing a line)
   *   4. Viral Reply Tree Mitigation (Activity 2 Section IV-B):
   *      - Depth Capping: Caps branches at maxDepth
   *      - Top-K Child Ranking: Uses FeedMaxHeap to rank child replies and caps visible count
   *      - hiddenChildrenCount: Enables a working "View more replies" lazy expansion button!
   *
   * Time Complexity: O(m)
   * Space Complexity: O(m)
   */
  public flattenPreOrderDFS(options?: ReplyTreeOptions): FlattenedReply<T>[] {
    if (!this.root) return [];

    const maxDepth = options?.maxDepth ?? 3;
    const maxChildrenPerNode = options?.maxChildrenPerNode ?? 5;
    const result: FlattenedReply<T>[] = [];

    // Recursive Pre-Order DFS
    const traverse = (
      node: ReplyNode<T>,
      depth: number,
      isLastChild: boolean,
      ancestorMask: boolean[]
    ) => {
      // Don't render the root node itself as a reply item (root is the main post)
      if (depth > 0) {
        result.push({
          node,
          depth,
          isLastChild,
          connectorMask: [...ancestorMask],
          hiddenChildrenCount: 0,
          isDepthCapped: false,
        });
      }

      // Check if we hit the depth cap
      if (depth >= maxDepth) {
        if (node.children.length > 0) {
          // Mark the last inserted item as depth capped with count of hidden replies
          const lastItem = result[result.length - 1];
          if (lastItem) {
            lastItem.isDepthCapped = true;
            lastItem.hiddenChildrenCount = this.countSubtreeNodes(node) - 1;
          }
        }
        return; // Cease deeper recursion for main thread view
      }

      // Rank children by score using our FeedMaxHeap (Activity 2 Section IV-B)
      let childrenToRender = node.children;
      let hiddenCount = 0;

      if (node.children.length > maxChildrenPerNode) {
        // Use Max-Heap to extract the top-K highest scoring replies (NO Array.sort!)
        const heap = new FeedMaxHeap();
        for (const child of node.children) {
          heap.insert({
            id: child.id,
            likes: Math.round(child.score),
            replies: child.children.length,
            hours_old: 1,
          });
        }

        const topScored = heap.topK(maxChildrenPerNode);
        const topIds = new Set(topScored.map((s) => s.id));
        childrenToRender = node.children.filter((c) => topIds.has(c.id));
        hiddenCount = node.children.length - childrenToRender.length;
      }

      // Traverse children in pre-order
      for (let i = 0; i < childrenToRender.length; i++) {
        const child = childrenToRender[i];
        const isLast = i === childrenToRender.length - 1 && hiddenCount === 0;

        // Ancestor mask: true means parent column should draw a continuing vertical line
        const nextMask = depth === 0 ? [] : [...ancestorMask, !isLastChild];

        traverse(child, depth + 1, isLast, nextMask);
      }

      // If children were truncated by top-K cap, update the node's hidden count
      if (hiddenCount > 0 && result.length > 0) {
        const lastEntry = result[result.length - 1];
        if (lastEntry) {
          lastEntry.hiddenChildrenCount += hiddenCount;
        }
      }
    };

    traverse(this.root, 0, true, []);
    return result;
  }

  /** Counts total nodes in a subtree rooted at node (inclusive). */
  private countSubtreeNodes(node: ReplyNode<T>): number {
    let count = 1;
    for (const child of node.children) {
      count += this.countSubtreeNodes(child);
    }
    return count;
  }

  /** Returns total count of nodes in the entire reply tree. */
  public get size(): number {
    return this.nodeMap.size;
  }

  /** Returns root post node or null. */
  public get rootNode(): ReplyNode<T> | null {
    return this.root;
  }

  /** Clears the tree and frees node pointers. */
  public clear(): void {
    this.root = null;
    this.nodeMap.clear();
  }
}
