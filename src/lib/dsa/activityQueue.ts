/**
 * ============================================================================
 * FEATURE 4: ACTIVITY NOTIFICATIONS — FIFO QUEUE + DOUBLY LINKED LIST
 * Activity 2 Paper: Section II-D | Activity 3 Rubric: Feature D
 * ============================================================================
 * Architecture:
 *   1. Delivery: Pointer-Based FIFO Queue (Head & Tail pointers)
 *   2. History:  Doubly Linked List (Prev & Next pointers + ID Hash Map)
 * Time Complexity:
 *   - enqueue():              O(1) strict constant time
 *   - dequeue():              O(1) strict constant time (NO Array.shift()!)
 *   - appendHistory():        O(1) strict constant time
 *   - removeHistoryById():    O(1) strict pointer unlinking without scanning
 *   - toArrayNewestFirst():   O(m) bidirectional traversal
 * Space Complexity:           O(m) nodes
 *
 * Why this structure?
 * Two jobs need two different structures:
 *   - Delivery is a waiting line: First event in must be first event out (FIFO).
 *     An array queue is poor because shift() shifts every element, costing O(n).
 *     A pointer-based linked queue enqueues at tail and dequeues at head in O(1).
 *   - History needs bidirectional scrolling and middle-of-list deletion.
 *     A doubly linked list stores both prev and next pointers, so when an alert
 *     is dismissed, holding its node unlinks it in O(1) with zero array copying.
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// PART A: POINTER-BASED FIFO QUEUE (DELIVERY PIPELINE)
// ----------------------------------------------------------------------------

interface QueueNode<T> {
  value: T;
  next: QueueNode<T> | null;
}

export class FifoQueue<T> {
  private head: QueueNode<T> | null = null; // Front of queue (where dequeue happens)
  private tail: QueueNode<T> | null = null; // Rear of queue (where enqueue happens)
  private count: number = 0;

  /**
   * Enqueues an item at the rear of the queue.
   * Time Complexity: O(1) strict
   * Space Complexity: O(1)
   */
  public enqueue(item: T): void {
    const newNode: QueueNode<T> = { value: item, next: null };
    if (!this.tail) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      this.tail.next = newNode;
      this.tail = newNode;
    }
    this.count++;
  }

  /**
   * Removes and returns the item at the front of the queue.
   * STRICT ENFORCEMENT: Uses node pointer update, NEVER Array.shift()!
   * Time Complexity: O(1) strict
   */
  public dequeue(): T | null {
    if (!this.head) {
      return null;
    }
    const val = this.head.value;
    this.head = this.head.next;
    if (!this.head) {
      this.tail = null;
    }
    this.count--;
    return val;
  }

  /**
   * Inspects the item at the front without dequeuing.
   * Time Complexity: O(1)
   */
  public peek(): T | null {
    return this.head ? this.head.value : null;
  }

  /** Returns true if queue has no elements. */
  public get isEmpty(): boolean {
    return this.count === 0;
  }

  /** Number of items currently queued. */
  public get size(): number {
    return this.count;
  }

  /**
   * Drains all items from the queue in FIFO order.
   * Time Complexity: O(n)
   */
  public drainAll(): T[] {
    const items: T[] = [];
    while (!this.isEmpty) {
      const item = this.dequeue();
      if (item !== null) items.push(item);
    }
    return items;
  }

  /** Clears the queue. */
  public clear(): void {
    this.head = null;
    this.tail = null;
    this.count = 0;
  }
}

// ----------------------------------------------------------------------------
// PART B: DOUBLY LINKED LIST + NODE INDEX MAP (NOTIFICATION HISTORY)
// ----------------------------------------------------------------------------

export interface DoublyNode<T> {
  id: string;
  value: T;
  prev: DoublyNode<T> | null;
  next: DoublyNode<T> | null;
}

export class NotificationHistoryList<T> {
  private head: DoublyNode<T> | null = null; // Oldest item
  private tail: DoublyNode<T> | null = null; // Newest item
  private count: number = 0;

  /** Hash map of ID -> DoublyNode for O(1) direct reference and unlinking */
  private nodeMap: Map<string, DoublyNode<T>> = new Map();

  /**
   * Appends a delivered notification to the tail (newest) of the history list.
   * Time Complexity: O(1) strict
   */
  public append(id: string, item: T): DoublyNode<T> {
    // If ID already exists in history, remove old node first
    if (this.nodeMap.has(id)) {
      this.removeById(id);
    }

    const newNode: DoublyNode<T> = {
      id,
      value: item,
      prev: this.tail,
      next: null,
    };

    if (!this.head) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      this.tail!.next = newNode;
      newNode.prev = this.tail;
      this.tail = newNode;
    }

    this.nodeMap.set(id, newNode);
    this.count++;
    return newNode;
  }

  /**
   * Unlinks a notification by ID in strict O(1) time.
   * Updates prev.next and next.prev with zero array scanning or element shifting.
   * Time Complexity: O(1) strict
   */
  public removeById(id: string): boolean {
    const node = this.nodeMap.get(id);
    if (!node) {
      return false;
    }

    // Unlink from predecessor
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next; // Node was head
    }

    // Unlink from successor
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev; // Node was tail
    }

    this.nodeMap.delete(id);
    this.count--;
    return true;
  }

  /**
   * Traverses backward from tail to head (Newest -> Oldest).
   * Time Complexity: O(m)
   */
  public toArrayNewestFirst(): T[] {
    const result: T[] = [];
    let curr = this.tail;
    while (curr) {
      result.push(curr.value);
      curr = curr.prev;
    }
    return result;
  }

  /**
   * Traverses forward from head to tail (Oldest -> Newest).
   * Time Complexity: O(m)
   */
  public toArrayOldestFirst(): T[] {
    const result: T[] = [];
    let curr = this.head;
    while (curr) {
      result.push(curr.value);
      curr = curr.next;
    }
    return result;
  }

  public get size(): number {
    return this.count;
  }

  public get isEmpty(): boolean {
    return this.count === 0;
  }

  public clear(): void {
    this.head = null;
    this.tail = null;
    this.nodeMap.clear();
    this.count = 0;
  }
}

// ----------------------------------------------------------------------------
// PART C: COMBINED ACTIVITY NOTIFICATION ENGINE
// ----------------------------------------------------------------------------

export interface NotificationItem {
  id: string;
  type: 'like' | 'reply' | 'repost' | 'follow' | 'mention';
  actor_id: string;
  actor_username: string;
  actor_avatar?: string;
  actor_is_verified?: boolean;
  post_id?: string;
  post_content?: string;
  created_at: string;
  read: boolean;
}

/**
 * Orchestrates the complete delivery and history pipeline as shown in
 * Activity 2 Paper Fig. 5:
 *   1. Incoming events join the FIFO queue (Delivery buffer).
 *   2. Push service dequeues events in chronological order.
 *   3. Delivered events are archived in the Doubly Linked List for history.
 */
export class ActivityNotificationEngine {
  public deliveryQueue = new FifoQueue<NotificationItem>();
  public historyList = new NotificationHistoryList<NotificationItem>();

  /**
   * Ingests a new notification into the delivery queue.
   * Time Complexity: O(1)
   */
  public receiveEvent(item: NotificationItem): void {
    this.deliveryQueue.enqueue(item);
  }

  /**
   * Flushes the delivery queue into the history list in FIFO order.
   * Time Complexity: O(k) for k pending items
   */
  public processPendingDelivery(): number {
    let processed = 0;
    while (!this.deliveryQueue.isEmpty) {
      const item = this.deliveryQueue.dequeue();
      if (item) {
        this.historyList.append(item.id, item);
        processed++;
      }
    }
    return processed;
  }

  /**
   * Unlinks an item from history in O(1) constant time.
   */
  public dismissNotification(id: string): boolean {
    return this.historyList.removeById(id);
  }

  /**
   * Returns history ordered by chronological selection.
   */
  public getHistory(order: 'newest_first' | 'oldest_first' = 'newest_first'): NotificationItem[] {
    return order === 'newest_first'
      ? this.historyList.toArrayNewestFirst()
      : this.historyList.toArrayOldestFirst();
  }
}
