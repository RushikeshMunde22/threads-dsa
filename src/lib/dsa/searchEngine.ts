/**
 * ============================================================================
 * FEATURE 6 & 7: SEARCH ENGINE — TRIE (PREFIX TREE) + KMP SUBSTRING MATCHER
 * Activity 2 Paper: Section III (Search Optimization)
 * ============================================================================
 * Architecture:
 *   1. PrefixTrie: Ordered character tree with Map-backed child pointers
 *   2. KMP Matcher: Knuth-Morris-Pratt with π (LPS) pre-processing
 * Time Complexity:
 *   - Trie insert(word):      O(L) where L = word length
 *   - Trie search(prefix):    O(L + k * m) independent of total database size N
 *   - KMP buildLpsArray(P):   O(M) where M = pattern length
 *   - KMP search(T, P):       O(N + M) guaranteed linear with zero backtracking
 * Space Complexity:
 *   - Trie:                   O(Sigma * L * N) memory-optimized via Map
 *   - KMP:                    O(M) for the LPS array
 * ============================================================================
 */

export interface TrieMatch {
  word: string;
  type: 'username' | 'hashtag' | 'keyword';
  id?: string;
  metadata?: Record<string, unknown>;
}

class TrieNode {
  public children: Map<string, TrieNode> = new Map();
  public isEndOfWord: boolean = false;
  public matchData?: TrieMatch;
}

export class PrefixTrie {
  private root: TrieNode = new TrieNode();
  private wordCount: number = 0;

  /**
   * Inserts a word/token into the Trie.
   * Walks down or creates a path of characters.
   * Time Complexity: O(L) where L = word.length
   */
  public insert(word: string, type: 'username' | 'hashtag' | 'keyword' = 'keyword', id?: string, metadata?: Record<string, unknown>): void {
    if (!word || word.trim().length === 0) return;
    const cleanWord = word.trim().toLowerCase();

    let curr = this.root;
    for (let i = 0; i < cleanWord.length; i++) {
      const char = cleanWord[i];
      let child = curr.children.get(char);
      if (!child) {
        child = new TrieNode();
        curr.children.set(char, child);
      }
      curr = child;
    }

    if (!curr.isEndOfWord) {
      this.wordCount++;
    }

    curr.isEndOfWord = true;
    curr.matchData = {
      word: cleanWord,
      type,
      id,
      metadata,
    };
  }

  /**
   * Returns autocomplete completions matching the given prefix.
   * Traverses to the prefix node in O(L), then gathers top completions via DFS.
   * Time Complexity: O(L + k) where k is the number of collected completions
   */
  public autocomplete(prefix: string, limit: number = 10): TrieMatch[] {
    if (!prefix) return [];
    const cleanPrefix = prefix.trim().toLowerCase();

    let curr = this.root;
    for (let i = 0; i < cleanPrefix.length; i++) {
      const char = cleanPrefix[i];
      const child = curr.children.get(char);
      if (!child) {
        return []; // Prefix not found
      }
      curr = child;
    }

    // Prefix node found: collect words via DFS
    const results: TrieMatch[] = [];
    const collectDfs = (node: TrieNode) => {
      if (results.length >= limit) return;
      if (node.isEndOfWord && node.matchData) {
        results.push(node.matchData);
      }
      for (const childNode of node.children.values()) {
        collectDfs(childNode);
        if (results.length >= limit) break;
      }
    };

    collectDfs(curr);
    return results;
  }

  public get size(): number {
    return this.wordCount;
  }

  public clear(): void {
    this.root = new TrieNode();
    this.wordCount = 0;
  }
}

// ----------------------------------------------------------------------------
// KNUTH-MORRIS-PRATT (KMP) SUBSTRING MATCHER
// ----------------------------------------------------------------------------

export interface KmpResult {
  matches: number[]; // Array of start indices where pattern was found in text
  lpsArray: number[]; // Longest Proper Prefix which is also Suffix array
  comparisons: number; // Total character comparisons performed
  patternLength: number;
  textLength: number;
}

/**
 * Precomputes the Longest Proper Prefix which is also Suffix (LPS / π) array.
 * Time Complexity: O(M) where M = pattern.length
 * Space Complexity: O(M)
 */
export function buildLpsArray(pattern: string): number[] {
  const m = pattern.length;
  const lps = new Array<number>(m).fill(0);
  let length = 0; // Length of previous longest prefix suffix
  let i = 1;

  while (i < m) {
    if (pattern[i] === pattern[length]) {
      length++;
      lps[i] = length;
      i++;
    } else {
      if (length !== 0) {
        length = lps[length - 1]; // Fallback to previous longest prefix
      } else {
        lps[i] = 0;
        i++;
      }
    }
  }

  return lps;
}

/**
 * Executes true Knuth-Morris-Pratt substring search.
 * When a mismatch occurs, shifts pattern based on LPS table with ZERO backtracking
 * of the text pointer i.
 *
 * Time Complexity: O(N + M) guaranteed linear time
 * Space Complexity: O(M) auxiliary space for LPS table
 */
export function kmpSearch(text: string, pattern: string): KmpResult {
  if (!text || !pattern || pattern.length === 0 || pattern.length > text.length) {
    return {
      matches: [],
      lpsArray: [],
      comparisons: 0,
      patternLength: pattern?.length ?? 0,
      textLength: text?.length ?? 0,
    };
  }

  const cleanText = text.toLowerCase();
  const cleanPattern = pattern.toLowerCase();

  const lps = buildLpsArray(cleanPattern);
  const matches: number[] = [];
  let comparisons = 0;

  let i = 0; // Text pointer (never moves backward!)
  let j = 0; // Pattern pointer

  while (i < cleanText.length) {
    comparisons++;
    if (cleanPattern[j] === cleanText[i]) {
      i++;
      j++;
    }

    if (j === cleanPattern.length) {
      // Complete match found
      matches.push(i - j);
      j = lps[j - 1]; // Slide pattern based on LPS
    } else if (i < cleanText.length && cleanPattern[j] !== cleanText[i]) {
      // Mismatch after j matches
      if (j !== 0) {
        j = lps[j - 1]; // Use LPS table to slide pattern forward
      } else {
        i++; // No prefix matched, advance text pointer
      }
    }
  }

  return {
    matches,
    lpsArray: lps,
    comparisons,
    patternLength: pattern.length,
    textLength: text.length,
  };
}
