/**
 * ============================================================================
 * FEATURE 1: SOCIAL / FOLLOWER NETWORK — DIRECTED GRAPH
 * Activity 2 Paper: Section II-A | Activity 3 Rubric: Feature A
 * ============================================================================
 * Architecture: Directed Graph (Adjacency List + Hash Sets)
 * Time Complexity:
 *   - follow(u, v):         O(1) average
 *   - isFollowing(u, v):    O(1) average
 *   - unfollow(u, v):       O(1) average
 *   - getMutualFollowers:   O(min(deg(u), deg(v))) set intersection
 *   - suggestConnections:  O(V + E) via 2-Hop BFS
 *   - findShortestPath:    O(V + E) via BFS Shortest Path
 * Space Complexity:         O(V + E) memory proportional to real connections
 *
 * Why this structure?
 * Following is asymmetric ("u follows v" does not imply "v follows u").
 * An adjacency matrix requires O(V^2) space (10 PB RAM for 100M users).
 * An adjacency list backed by Hash Sets stores only real edges in O(V + E)
 * space while providing instant O(1) membership lookups with zero duplicates.
 * ============================================================================
 */

export interface ConnectionSuggestion {
  userId: string;
  mutualCount: number;
  mutualIds: string[];
}

export interface ShortestPathResult {
  found: boolean;
  distance: number;
  path: string[];
}

export class SocialGraph {
  /** Outgoing edges: u -> Set of users that u follows */
  private following: Map<string, Set<string>> = new Map();

  /** Incoming edges: v -> Set of users who follow v */
  private followers: Map<string, Set<string>> = new Map();

  /**
   * Registers a user in the graph if not already present.
   * Time Complexity: O(1)
   */
  public addUser(userId: string): void {
    if (!this.following.has(userId)) {
      this.following.set(userId, new Set());
    }
    if (!this.followers.has(userId)) {
      this.followers.set(userId, new Set());
    }
  }

  /**
   * Creates a directed edge u -> v ("u follows v").
   * Prevents self-following and ignores duplicate edges.
   * Time Complexity: O(1) average
   * Space Complexity: O(1) auxiliary
   */
  public follow(u: string, v: string): boolean {
    if (u === v) return false; // Prevent self-following

    this.addUser(u);
    this.addUser(v);

    const outSet = this.following.get(u)!;
    if (outSet.has(v)) {
      return false; // Already following (idempotent)
    }

    outSet.add(v);
    this.followers.get(v)!.add(u);
    return true;
  }

  /**
   * Removes the directed edge u -> v ("u unfollows v").
   * Time Complexity: O(1) average
   */
  public unfollow(u: string, v: string): boolean {
    const outSet = this.following.get(u);
    const inSet = this.followers.get(v);

    if (!outSet || !inSet || !outSet.has(v)) {
      return false;
    }

    outSet.delete(v);
    inSet.delete(u);
    return true;
  }

  /**
   * Answers "does u follow v?" via instant Hash Set membership check.
   * Time Complexity: O(1) average
   */
  public isFollowing(u: string, v: string): boolean {
    const outSet = this.following.get(u);
    return outSet ? outSet.has(v) : false;
  }

  /**
   * Returns list of user IDs that u follows (out-edges).
   * Time Complexity: O(deg^+(u))
   */
  public getFollowing(userId: string): string[] {
    const set = this.following.get(userId);
    return set ? Array.from(set) : [];
  }

  /**
   * Returns list of user IDs who follow userId (in-edges).
   * Time Complexity: O(deg^-(u))
   */
  public getFollowers(userId: string): string[] {
    const set = this.followers.get(userId);
    return set ? Array.from(set) : [];
  }

  /**
   * Calculates mutual followers between userA and userB.
   * Intersects userA's following set with userB's following set.
   * Time Complexity: O(min(deg^+(A), deg^+(B)))
   * Space Complexity: O(min(deg^+(A), deg^+(B)))
   */
  public getMutualFollowers(userA: string, userB: string): string[] {
    const setA = this.following.get(userA);
    const setB = this.following.get(userB);

    if (!setA || !setB || setA.size === 0 || setB.size === 0) {
      return [];
    }

    // Iterate over the smaller set for optimal intersection time
    const [smaller, larger] = setA.size < setB.size ? [setA, setB] : [setB, setA];
    const mutuals: string[] = [];

    for (const id of smaller) {
      if (larger.has(id)) {
        mutuals.push(id);
      }
    }

    return mutuals;
  }

  /**
   * Suggests new connections using a 2-Hop BFS ("Friends of Friends").
   * Explores vertices at distance d = 2 from userId while excluding:
   *   1. The user themselves
   *   2. Users already followed by userId (d = 1)
   *
   * Ranked descending by mutual follower frequency count.
   * Time Complexity: O(V + E)
   * Space Complexity: O(V)
   */
  public suggestConnections(userId: string, limit: number = 10): ConnectionSuggestion[] {
    const myFollowing = this.following.get(userId);
    if (!myFollowing || myFollowing.size === 0) {
      return [];
    }

    // candidateId -> array of mutual friend IDs who bridge to them
    const candidateMap = new Map<string, string[]>();

    // 1-Hop traversal: iterate through who I follow
    for (const friendId of myFollowing) {
      const friendsFollowing = this.following.get(friendId);
      if (!friendsFollowing) continue;

      // 2-Hop traversal: who do my followees follow?
      for (const candidateId of friendsFollowing) {
        // Exclude self and anyone I already follow
        if (candidateId === userId || myFollowing.has(candidateId)) {
          continue;
        }

        const mutuals = candidateMap.get(candidateId) ?? [];
        mutuals.push(friendId);
        candidateMap.set(candidateId, mutuals);
      }
    }

    // Convert map to ranked array
    const suggestions: ConnectionSuggestion[] = [];
    for (const [candId, mutualIds] of candidateMap.entries()) {
      suggestions.push({
        userId: candId,
        mutualCount: mutualIds.length,
        mutualIds,
      });
    }

    // Rank descending by number of shared connections (tie-break by ID)
    suggestions.sort((a, b) => b.mutualCount - a.mutualCount || a.userId.localeCompare(b.userId));

    return suggestions.slice(0, Math.max(1, limit));
  }

  /**
   * Activity 3 Feature A Requirement: Shortest connection path between two users.
   * Uses Breadth-First Search (BFS) to find the minimum follow hops from start to target.
   *
   * Time Complexity: O(V + E)
   * Space Complexity: O(V)
   */
  public findShortestPath(startUserId: string, targetUserId: string): ShortestPathResult {
    if (startUserId === targetUserId) {
      return { found: true, distance: 0, path: [startUserId] };
    }

    if (!this.following.has(startUserId) || !this.following.has(targetUserId)) {
      return { found: false, distance: -1, path: [] };
    }

    const visited = new Set<string>([startUserId]);
    const parentMap = new Map<string, string>(); // child -> parent for path reconstruction

    // BFS Queue using array with head pointer for O(1) dequeue
    const queue: string[] = [startUserId];
    let head = 0;
    let found = false;

    while (head < queue.length) {
      const current = queue[head++];
      if (current === targetUserId) {
        found = true;
        break;
      }

      const neighbors = this.following.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            parentMap.set(neighbor, current);
            queue.push(neighbor);
          }
        }
      }
    }

    if (!found) {
      return { found: false, distance: -1, path: [] };
    }

    // Backtrack path from target to start
    const path: string[] = [];
    let curr: string | undefined = targetUserId;
    while (curr) {
      path.push(curr);
      curr = parentMap.get(curr);
    }
    path.reverse();

    return {
      found: true,
      distance: path.length - 1,
      path,
    };
  }

  /** Returns total number of registered users (vertices). */
  public get vertexCount(): number {
    return this.following.size;
  }

  /** Returns total number of active follow edges. */
  public get edgeCount(): number {
    let count = 0;
    for (const set of this.following.values()) {
      count += set.size;
    }
    return count;
  }

  /** Clears all vertices and edges. */
  public clear(): void {
    this.following.clear();
    this.followers.clear();
  }
}
