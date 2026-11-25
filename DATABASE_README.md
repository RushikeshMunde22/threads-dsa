# Database Architecture & Supabase Specification (`DATABASE_README.md`)

## 1. Entity-Relationship Overview

All live application state (profiles, posts, nested replies, reposts, likes, directed social graph edges, and activity notifications) lives in Supabase PostgreSQL. No mock or hardcoded data is ever seeded into production tables.

```
auth.users (Supabase Auth)
    │ 1:1 (trigger: handle_new_user)
    ▼
public.profiles (id, username, full_name, bio, avatar_url, followers_count, following_count)
    ├── 1:N ──▶ public.posts (id, author_id, parent_id, root_id, repost_of_id, content, media_urls[], hashtags[], likes_count, replies_count, reposts_count)
    ├── M:N ──▶ public.likes (user_id, post_id)
    ├── M:N ──▶ public.follows (follower_id -> following_id)  [Directed Social Graph]
    └── 1:N ──▶ public.notifications (id, recipient_id, actor_id, type, post_id, is_read, created_at)
```

## 2. Complete PostgreSQL Schema

The full idempotent migration script is stored in [`supabase/schema.sql`](./supabase/schema.sql). Run it once in the Supabase SQL Editor (or via `supabase db push`).

Key design choices:
- **Self-Referential Replies (`parent_id`, `root_id`):** Enables fetching an entire thread in a single indexed query (`WHERE root_id = $1 OR id = $1`) and feeding the flat rows into the C++ `ReplyTree` N-ary tree builder (`O(N)` construction + DFS traversal).
- **Trigger-Maintained Counters:** `likes_count`, `replies_count`, `reposts_count`, `followers_count`, and `following_count` are updated atomically via `SECURITY DEFINER` triggers, preventing client-side counter spoofing.
- **Hashtag GIN Index:** `hashtags TEXT[]` uses a GIN index for fast PostgreSQL filtering while the C++ `TrieSearch` provides `O(L)` prefix autocomplete and KMP `O(N+M)` full-text search.

## 3. Row Level Security (RLS) Matrix

| Table | `SELECT` | `INSERT` | `UPDATE` | `DELETE` |
| :--- | :--- | :--- | :--- | :--- |
| `profiles` | Public (`TRUE`) | `auth.uid() = id` | `auth.uid() = id` | Cascade from `auth.users` |
| `posts` | Public (`TRUE`) | `auth.uid() = author_id` | `auth.uid() = author_id` | `auth.uid() = author_id` |
| `likes` | Public (`TRUE`) | `auth.uid() = user_id` | Denied | `auth.uid() = user_id` |
| `follows` | Public (`TRUE`) | `auth.uid() = follower_id` | Denied | `auth.uid() = follower_id` |
| `notifications` | `auth.uid() = recipient_id` | Trigger-only (`SECURITY DEFINER`) | `auth.uid() = recipient_id` | `auth.uid() = recipient_id` |

## 4. Storage Buckets & Policies

| Bucket | Public Read | Max Size | Allowed MIME Types | Path Convention | Write/Delete Policy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `thread-media` | Yes | 10 MB | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | `<user_id>/<uuid>.<ext>` | `(storage.foldername(name))[1] = auth.uid()::text` |
| `avatars` | Yes | 5 MB | `image/jpeg`, `image/png`, `image/webp` | `<user_id>/<filename>` | `(storage.foldername(name))[1] = auth.uid()::text` |

## 5. Authentication Flows (Google OAuth + Email/Password with Email OTP)

### 5.1 Google OAuth (PKCE)
1. Client invokes `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '${origin}/auth/callback' } })`.
2. Google redirects to `/auth/callback?code=...`.
3. `src/app/auth/callback/route.ts` calls `supabase.auth.exchangeCodeForSession(code)` on the server, sets HTTP-only SSR cookies, and redirects to `/`.
4. `on_auth_user_created` trigger automatically provisions a unique `public.profiles` row.

### 5.2 Email/Password + 6-Digit Email OTP Verification
1. **Sign Up:** `supabase.auth.signUp({ email, password, options: { data: { full_name, preferred_username } } })` dispatches a 6-digit OTP code via Supabase Auth email templates.
2. **Verify OTP:** User enters the 6-digit token in the OTP verification view; client calls `supabase.auth.verifyOtp({ email, token, type: 'signup' })`.
3. **Passwordless Email OTP Sign-In:** Also supported via `supabase.auth.signInWithOtp({ email })` + `verifyOtp({ email, token, type: 'email' })`.
4. **SSR Route Protection:** `middleware.ts` refreshes the Supabase session on every request via `@supabase/ssr` and redirects unauthenticated users away from protected routes (`/activity`, `/dsa-lab`) or passes session context to Server Components.

### Required Supabase Dashboard & Google Cloud Auth Settings
- **Authentication -> Providers -> Google:**
  - Enable Google: `ON`
  - Client ID: `your-google-client-id`
  - Client Secret: `your-google-client-secret`
- **Google Cloud Console (APIs & Services -> Credentials):**
  - **Authorized JavaScript origins:** `http://localhost:3000` (and `https://<your-vercel-domain>`)
  - **Authorized redirect URIs:** `https://<your-project-ref>.supabase.co/auth/v1/callback`
- **Authentication -> URL Configuration (Supabase Dashboard):**
  - **Site URL:** `http://localhost:3000`
  - **Redirect URLs:** `http://localhost:3000/auth/callback` and `https://<your-vercel-domain>/auth/callback`
- **Authentication -> Email Templates -> Confirm signup:** Include `{{ .Token }}` so users receive the 6-digit OTP code directly in their inbox.
- **Authentication -> SMTP Settings (Optional for Supabase GoTrue):**
  - Enable Custom SMTP: `ON`
  - Sender Email: `your-email@gmail.com`
  - Sender Name: `Threads`
  - Host: `smtp.gmail.com`
  - Port: `465` (SSL)
  - Username: `your-email@gmail.com`
  - Password: `your-gmail-app-password`
  *(Note: The Next.js API routes `/api/auth/send-otp` and `/api/auth/verify-otp` use Nodemailer directly with these credentials for 100% reliable 6-digit OTP delivery without provider rate limits).*

## 6. Supabase REST API Usage Patterns

- **Feed Fetch:** `supabase.from('posts').select('*, author:profiles!posts_author_id_fkey(*), repost_of:posts!posts_repost_of_id_fkey(*, author:profiles!posts_author_id_fkey(*))').is('parent_id', null).order('created_at', { ascending: false }).limit(100)`
- **Thread Tree Fetch:** `supabase.from('posts').select('*, author:profiles!posts_author_id_fkey(*)').or('id.eq.<rootId>,root_id.eq.<rootId>').order('created_at', { ascending: true })`
- **Social Graph Edges Fetch:** `supabase.from('follows').select('follower_id, following_id')`
- **Activity Notifications Fetch:** `supabase.from('notifications').select('*, actor:profiles!notifications_actor_id_fkey(*), post:posts(*)').eq('recipient_id', userId).order('created_at', { ascending: true })`

## 7. C++ DSA Engine Data-Flow Diagram

```
┌──────────────────┐        Supabase PostgREST / SSR        ┌──────────────────────────┐
│  Supabase DB     │ ─────────────────────────────────────▶ │  Next.js App Router /    │
│  (PostgreSQL +   │                                        │  API Gateway (/api/dsa)  │
│   RLS + Storage) │ ◀───────────────────────────────────── │                          │
└──────────────────┘         Mutations (CRUD, Likes)        └────────────┬─────────────┘
                                                                         │ JSON Payload
                                                                         ▼
                                                       ┌─────────────────────────────────┐
                                                       │  C++17 DSA Engine (/cpp-engine) │
                                                       │  Mode A: WebAssembly (Vercel)   │
                                                       │  Mode B: cpp-httplib (Docker)   │
                                                       │  ┌───────────────────────────┐  │
                                                       │  │ Trie + KMP   │ Max-Heap   │  │
                                                       │  │ Reply N-Tree │ BFS Graph  │  │
                                                       │  │ FIFO Queue   │ LIFO Stack │  │
                                                       │  └───────────────────────────┘  │
                                                       └────────────────┬────────────────┘
                                                                        │ Ranked/Structured JSON
                                                                        │ + Timing (ms) + Big-O
                                                                        ▼
                                                       ┌─────────────────────────────────┐
                                                       │  React Client UI +              │
                                                       │  DSA Complexity Inspector Drawer│
                                                       └─────────────────────────────────┘
```
