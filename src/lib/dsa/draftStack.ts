/**
 * ============================================================================
 * FEATURE 5: COMPOSER UNDO/REDO — BOUNDED LIFO STACK
 * Activity 2 Paper: Section II-E | Activity 3 Rubric: Feature E
 * ============================================================================
 * Architecture: Bounded LIFO (Last-In, First-Out) Stack
 * Time Complexity:
 *   - push():                 O(1) strict constant time
 *   - pop():                  O(1) strict constant time
 *   - peek():                 O(1)
 *   - undo():                 O(1)
 *   - redo():                 O(1)
 * Space Complexity:           O(s) bounded to max capacity (default 50 states)
 *
 * Why this structure?
 * While composing a post, a user reverses the most recent edit first (LIFO).
 * Every meaningful edit pushes a state snapshot onto the stack.
 * Tapping Undo pops the top and restores the state directly beneath it.
 * Only the top of the stack is ever touched, so operations are strictly O(1).
 * Memory is bounded to a maximum depth (s = 50) to prevent memory growth.
 * ============================================================================
 */

export interface DraftSnapshot {
  text: string;
  mediaUrls: string[];
  timestamp: number;
}

export class DraftUndoStack {
  private undoStack: DraftSnapshot[] = [];
  private redoStack: DraftSnapshot[] = [];
  private maxCapacity: number;

  constructor(maxCapacity: number = 50) {
    this.maxCapacity = Math.max(2, maxCapacity);
  }

  /**
   * Pushes a new draft snapshot onto the undo stack.
   * Clears the redo stack and bounds memory to maxCapacity.
   * Discards consecutive duplicate text states.
   *
   * Time Complexity: O(1)
   */
  public push(snapshot: { text: string; mediaUrls?: string[] }): boolean {
    const newSnap: DraftSnapshot = {
      text: snapshot.text,
      mediaUrls: snapshot.mediaUrls ? [...snapshot.mediaUrls] : [],
      timestamp: Date.now(),
    };

    // Ignore identical consecutive states to avoid redundant undo steps
    const top = this.peek();
    if (
      top &&
      top.text === newSnap.text &&
      top.mediaUrls.length === newSnap.mediaUrls.length &&
      top.mediaUrls.every((url, i) => url === newSnap.mediaUrls[i])
    ) {
      return false;
    }

    this.undoStack.push(newSnap);

    // Enforce bounded memory: if stack exceeds capacity, drop the oldest snapshot
    if (this.undoStack.length > this.maxCapacity) {
      this.undoStack.shift();
    }

    // A new edit invalidates the forward redo branch
    this.redoStack = [];
    return true;
  }

  /**
   * Pops and returns the top snapshot.
   * Time Complexity: O(1)
   */
  public pop(): DraftSnapshot | null {
    return this.undoStack.length > 0 ? this.undoStack.pop()! : null;
  }

  /**
   * Inspects the current active snapshot on top of the stack.
   * Time Complexity: O(1)
   */
  public peek(): DraftSnapshot | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1] : null;
  }

  /**
   * Executes an Undo operation:
   * Moves the current top snapshot to the redo stack and returns the previous state.
   * Time Complexity: O(1)
   */
  public undo(): DraftSnapshot | null {
    if (this.undoStack.length <= 1) {
      return null; // Cannot undo if at initial baseline
    }

    const current = this.undoStack.pop()!;
    this.redoStack.push(current);

    return this.peek();
  }

  /**
   * Executes a Redo operation:
   * Pops from the redo stack, pushes back to the undo stack, and returns the restored state.
   * Time Complexity: O(1)
   */
  public redo(): DraftSnapshot | null {
    if (this.redoStack.length === 0) {
      return null;
    }

    const nextState = this.redoStack.pop()!;
    this.undoStack.push(nextState);
    return nextState;
  }

  /** True if there is at least one previous state to revert to. */
  public get canUndo(): boolean {
    return this.undoStack.length > 1;
  }

  /** True if there is a previously undone state to advance to. */
  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Number of snapshots in the undo stack. */
  public get size(): number {
    return this.undoStack.length;
  }

  /** Returns all stored snapshots for educational inspection in /dsa-lab. */
  public getHistory(): DraftSnapshot[] {
    return this.undoStack.map((s) => ({ ...s }));
  }

  /** Clears both undo and redo stacks. */
  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
