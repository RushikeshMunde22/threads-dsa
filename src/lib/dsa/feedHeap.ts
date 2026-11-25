/**
 * ============================================================================
 * FEATURE 2: FOR YOU FEED — FLAT-ARRAY BINARY MAX-HEAP (PRIORITY QUEUE)
 * Activity 2 Paper: Section II-B & Section IV-A | Activity 3 Rubric: Feature B
 * ============================================================================
 * Architecture: Binary Max-Heap stored in a contiguous 0-indexed flat array
 * Time Complexity:
 *   - peek():              O(1)
 *   - insert():            O(log n) via siftUp
 *   - extractMax():        O(log n) via siftDown
 *   - topK(k):             O(k log n) — extractMax called k times (NO Array.sort())
 *   - buildHeap (bulk):    O(n) via Floyd's bottom-up heapify
 * Space Complexity:        O(n) contiguous array, CPU cache friendly
 *
 * Why this structure?
 * The For You feed is a RANKING problem, not a sorting problem.
 * Sorting all n candidate posts costs O(n log n).
 * A Max-Heap keeps the highest-scoring post at root (index 0) at all times.
 * Children sit at indices 2i+1 and 2i+2, requiring zero pointer overhead.
 * Extracting the visible top-K posts costs only O(k log n).
 * ============================================================================
 */

export interface CandidatePost {
  id: string;
  likes: number;
  reposts?: number;
  replies: number;
  hours_old: number;
  content?: string;
  author_id?: string;
  author_username?: string;
  author_avatar?: string;
  author_is_verified?: boolean;
}

export interface ScoredPost extends CandidatePost {
  score: number;
}

/**
 * Computes engagement score with gravity time-decay.
 * Formula from Activity 2 Section II-B:
 *   Score(P) = (likes + 2 * reposts + 3 * replies + 1) / (hours_old + 2)^1.5
 */
export function computeEngagementScore(post: {
  likes: number;
  reposts?: number;
  replies: number;
  hours_old: number;
}): number {
  const safeHours = Math.max(0, post.hours_old);
  const likesWeight = post.likes;
  const repostsWeight = (post.reposts ?? 0) * 2;
  const repliesWeight = post.replies * 3;
  const baseScore = likesWeight + repostsWeight + repliesWeight + 1;
  const timeDecay = Math.pow(safeHours + 2, 1.5);
  return Number((baseScore / timeDecay).toFixed(4));
}

export class FeedMaxHeap {
  /** Internal flat array representation of the binary tree */
  private heap: ScoredPost[] = [];

  constructor(initialPosts?: CandidatePost[]) {
    if (initialPosts && initialPosts.length > 0) {
      this.heap = initialPosts.map((p) => ({
        ...p,
        score: computeEngagementScore(p),
      }));
      this.buildHeap();
    }
  }

  // --- Array Index Math (Activity 2 Fig. 3) ---
  private parentIndex(i: number): number {
    return Math.floor((i - 1) / 2);
  }

  private leftChildIndex(i: number): number {
    return 2 * i + 1;
  }

  private rightChildIndex(i: number): number {
    return 2 * i + 2;
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }

  /**
   * Restores heap property upward after an element is appended at the end.
   * Walks up the branch at most log2(n) levels.
   * Time Complexity: O(log n)
   */
  private siftUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = this.parentIndex(current);
      if (this.heap[current].score > this.heap[parent].score) {
        this.swap(current, parent);
        current = parent;
      } else {
        break;
      }
    }
  }

  /**
   * Restores heap property downward after the root is replaced by the last element.
   * Compares parent against both children and swaps with the largest child.
   * Time Complexity: O(log n)
   */
  private siftDown(index: number): void {
    let current = index;
    const n = this.heap.length;

    while (true) {
      let largest = current;
      const left = this.leftChildIndex(current);
      const right = this.rightChildIndex(current);

      if (left < n && this.heap[left].score > this.heap[largest].score) {
        largest = left;
      }
      if (right < n && this.heap[right].score > this.heap[largest].score) {
        largest = right;
      }

      if (largest !== current) {
        this.swap(current, largest);
        current = largest;
      } else {
        break;
      }
    }
  }

  /**
   * Floyd's bottom-up linear-time heap construction.
   * Sifts down all internal nodes starting from the last non-leaf parent.
   * Time Complexity: O(n)
   */
  private buildHeap(): void {
    const n = this.heap.length;
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
      this.siftDown(i);
    }
  }

  /**
   * Inspects the maximum scoring element without removing it.
   * Time Complexity: O(1)
   */
  public peek(): ScoredPost | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  /**
   * Inserts a candidate post into the heap.
   * Appends to the array and sifts up until heap invariant is satisfied.
   * Time Complexity: O(log n)
   */
  public insert(post: CandidatePost): void {
    const scored: ScoredPost = {
      ...post,
      score: computeEngagementScore(post),
    };
    this.heap.push(scored);
    this.siftUp(this.heap.length - 1);
  }

  /**
   * Removes and returns the maximum scoring post (the root).
   * Replaces root with the last leaf, pops, and sifts down.
   * Time Complexity: O(log n)
   */
  public extractMax(): ScoredPost | null {
    const n = this.heap.length;
    if (n === 0) return null;
    if (n === 1) return this.heap.pop()!;

    const max = this.heap[0];
    this.heap[0] = this.heap.pop()!;
    this.siftDown(0);
    return max;
  }

  /**
   * Extracts the top-K highest scoring posts in descending order.
   * Employs repetitive extractMax() calls on a cloned heap.
   * STRICT ENFORCEMENT: Never uses Array.prototype.sort()!
   *
   * Time Complexity: O(k log n)
   * Space Complexity: O(n) for the clone
   */
  public topK(k: number): ScoredPost[] {
    const resultCount = Math.min(Math.max(0, k), this.heap.length);
    if (resultCount === 0) return [];

    // Clone the heap so the original instance remains unmodified
    const clonedHeap = new FeedMaxHeap();
    clonedHeap.heap = this.heap.map((p) => ({ ...p }));

    const topList: ScoredPost[] = [];
    for (let i = 0; i < resultCount; i++) {
      const max = clonedHeap.extractMax();
      if (max) {
        topList.push(max);
      }
    }

    return topList;
  }

  /** Current number of posts in the heap. */
  public get size(): number {
    return this.heap.length;
  }

  /** Returns true if the heap contains no elements. */
  public get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Returns a shallow copy of the internal flat array for visual tree inspections.
   * Useful for educational display in /dsa-lab.
   */
  public getArraySnapshot(): ScoredPost[] {
    return this.heap.map((p) => ({ ...p }));
  }

  /** Clears all posts from the heap. */
  public clear(): void {
    this.heap = [];
  }
}

/**
 * ============================================================================
 * ACTIVITY 2 SECTION IV-A: CELEBRITY WRITE-AMPLIFICATION BOTTLENECK SIMULATOR
 * ============================================================================
 * Compares Naive Fan-out on Write vs. Hybrid Push + Pull Model:
 *   - Naive Fan-out on Write:
 *       Every author post is copied to all F follower inboxes.
 *       Writes = F (For 50M followers, 1 post = 50,000,000 DB writes!).
 *   - Hybrid Push + Pull Architecture:
 *       If F < threshold (e.g. 10,000): PUSH to follower timelines (O(F) is cheap).
 *       If F >= threshold: STORE ONCE (1 DB write).
 *       Reader feed pulls celebrity posts and merges via Max-Heap in O(c log n).
 * ============================================================================
 */
export interface FanOutSimulationResult {
  authorFollowerCount: number;
  isCelebrity: boolean;
  threshold: number;
  naiveWriteCount: number;
  hybridWriteCount: number;
  writesSaved: number;
  readMergeComplexity: string;
  explanation: string;
}

export function simulateHybridFeedFanOut(
  followerCount: number,
  celebrityThreshold: number = 10000
): FanOutSimulationResult {
  const isCelebrity = followerCount >= celebrityThreshold;
  const naiveWriteCount = followerCount;
  const hybridWriteCount = isCelebrity ? 1 : followerCount;
  const writesSaved = naiveWriteCount - hybridWriteCount;

  return {
    authorFollowerCount: followerCount,
    isCelebrity,
    threshold: celebrityThreshold,
    naiveWriteCount,
    hybridWriteCount,
    writesSaved,
    readMergeComplexity: isCelebrity ? 'O(c log K) heap merge' : 'O(1) pre-computed inbox',
    explanation: isCelebrity
      ? `Celebrity threshold (${celebrityThreshold}) exceeded: saved ${writesSaved.toLocaleString()} database writes. Post stored once and pulled at read time.`
      : `Standard user (< ${celebrityThreshold} followers): pushed to all ${followerCount} follower inboxes for instant O(1) read access.`,
  };
}
