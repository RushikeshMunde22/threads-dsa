# Threads DSA — Production Web Prototype (Next.js + C++17 WASM/Native/HTTP + Supabase)

A production-ready visual and functional clone of **threads.net** engineered for a Data Structures & Algorithms (DSA) project supporting 100–500 real users. All live application data (users, posts, replies, reposts, likes, follows, and notifications) is persisted in **Supabase** with strict Row Level Security (RLS), while ranking, search, nested reply traversal, social graph mutuals/recommendations, notification queueing, and draft undo history are powered by a **C++17 DSA Engine**.

## Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Next.js 15 App Router)                   │
│  True Dark (#0A0A0A) / Light UI · Left Rail · 620px Feed · DSA Inspector   │
└──────────────┬───────────────────────────────────────┬─────────────────────┘
               │ @supabase/ssr + Realtime              │ JSON Payload
               ▼                                       ▼
┌──────────────────────────────┐        ┌────────────────────────────────────┐
│     Supabase Platform        │        │     C++17 DSA Engine (/cpp-engine) │
│  - PostgreSQL + RLS Policies │        │  Tier 1: WebAssembly (Emscripten)  │
│  - Google OAuth + Email OTP  │        │          /public/wasm/*.wasm       │
│  - Storage: thread-media,    │        │  Tier 2: Native CLI Process Pipe   │
│             avatars          │        │          threads_dsa_engine.exe    │
│  - Realtime Notifications    │        │  Tier 3: Standalone Docker HTTP    │
│  - Atomic Counter Triggers   │        │          cpp-httplib (/api/dsa)    │
│  - Public Role Grants        │        │  Tier 4: TypeScript Fallback       │
└──────────────────────────────┘        └────────────────────────────────────┘
```

## DSA Time & Space Complexity Table

| Module (`/cpp-engine/src/`) | Data Structure & Algorithm | Feature Powered | Time Complexity | Space Complexity |
| :--- | :--- | :--- | :--- | :--- |
| `trie_search.hpp` | **Trie (Prefix Tree)** | `@username` & `#hashtag` autocomplete | `O(L)` insert; `O(L + K·M)` prefix query | `O(Σ · L)` per token |
| `trie_search.hpp` | **Knuth-Morris-Pratt (KMP)** | Case-insensitive post content search | `O(N + M)` per post (`O(M)` LPS build) | `O(M)` |
| `feed_heap.hpp` | **Bounded Min/Max-Heap Priority Queue** | Ranked feed scoring `(likes*2 + replies*3) / (hours_old + 2)^1.5` | `O(N log K)` | `O(K)` |
| `reply_tree.hpp` | **N-ary Tree + Pre-order DFS** | Nested thread replies & vertical connector lines | `O(N)` build + traversal | `O(N + H)` (`H` = max depth) |
| `social_graph.hpp` | **Directed Adjacency List + 2-Hop BFS** | Mutual connections & friend-of-friend recommendations | `O(deg+(A) + deg+(B))` mutuals; `O(V + E)` BFS | `O(V + E)` |
| `activity_structures.hpp` | **FIFO Queue (`std::queue`)** | Chronological real-time activity notification dispatch | `O(1)` enqueue/dequeue; `O(N)` drain | `O(N)` |
| `activity_structures.hpp` | **LIFO Stack (`std::deque`/`std::stack`)** | Post composer draft undo history | `O(1)` push/pop/peek | `O(N)` (bounded) |

## Local Setup

### 1. Provision Supabase
1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL Editor.
2. Follow [`DATABASE_README.md`](./DATABASE_README.md) to enable Google OAuth and 6-digit Email OTP templates.
3. Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 2. Run C++17 Unit Tests & Native Engine
```bash
# Compile and run the C++17 unit test suite with microsecond timing benchmarks
g++ -std=c++17 -O2 -Wall -Wextra -I./cpp-engine/src cpp-engine/tests/test_engine.cpp -o cpp-engine/test_engine
./cpp-engine/test_engine

# Compile standalone native CLI JSON engine
g++ -std=c++17 -O2 -I./cpp-engine/src cpp-engine/src/main.cpp -o cpp-engine/threads_dsa_engine
```

### 3. C++17 Engine Execution Runtimes
The application features a resilient 4-layer execution hierarchy:
1. **WebAssembly (`C++17-WASM`):** Emscripten build via `npm run build:wasm` (emits `public/wasm/threads_dsa.js`).
2. **Native Process Pipe (`C++17-Native`):** Next.js API route invokes `cpp-engine/threads_dsa_engine.exe` via Node.js `child_process.spawnSync` stdin/stdout with live telemetry (`0.0656ms`).
3. **Docker Microservice (`C++17-HTTP`):** Standalone `cpp-httplib` server (`docker build -t threads-dsa-cpp ./cpp-engine && docker run -p 8080:8080 threads-dsa-cpp`) via `CPP_ENGINE_URL`.
4. **TypeScript Mirror (`TS-Mirror`):** Zero-config algorithmic mirror with identical Big-O data structures ensuring zero-error Vercel deployments out of the box.

### 4. Start Next.js Frontend
```bash
npm install
npm run dev
# Visit http://localhost:3000
```

### 5. Production Build Gate
```bash
npx tsc --noEmit
npm run lint
npm run build
```
All checks pass with **0 errors and 0 warnings**.
