-- ============================================================================
-- Threads DSA Clone — Production PostgreSQL Schema for Supabase
-- Supports 100-500+ real users with strict Row Level Security (RLS),
-- Storage Bucket policies, trigger-maintained counters, and realtime feeds.
-- ZERO fake/seed data is inserted into live tables.
-- ============================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Custom Types
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    CREATE TYPE public.activity_type AS ENUM ('like', 'reply', 'repost', 'follow');
  END IF;
END $$;

-- 3. Tables

-- 3.1 Profiles (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT UNIQUE NOT NULL
                    CHECK (username ~ '^[a-z0-9_.]{3,30}$'),
  full_name       TEXT NOT NULL DEFAULT '',
  bio             TEXT NOT NULL DEFAULT '' CHECK (char_length(bio) <= 300),
  avatar_url      TEXT,
  website         TEXT DEFAULT '',
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  followers_count INTEGER NOT NULL DEFAULT 0 CHECK (followers_count >= 0),
  following_count INTEGER NOT NULL DEFAULT 0 CHECK (following_count >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2 Posts (Supports top-level threads, nested replies via parent_id/root_id, and reposts)
CREATE TABLE IF NOT EXISTS public.posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  root_id         UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  repost_of_id    UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  content         TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 500),
  media_urls      TEXT[] NOT NULL DEFAULT '{}',
  hashtags        TEXT[] NOT NULL DEFAULT '{}',
  likes_count     INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  replies_count   INTEGER NOT NULL DEFAULT 0 CHECK (replies_count >= 0),
  reposts_count   INTEGER NOT NULL DEFAULT 0 CHECK (reposts_count >= 0),
  is_edited       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT post_has_payload CHECK (
    char_length(trim(content)) > 0
    OR array_length(media_urls, 1) > 0
    OR repost_of_id IS NOT NULL
  )
);

-- 3.3 Likes (Composite PK prevents duplicate likes)
CREATE TABLE IF NOT EXISTS public.likes (
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id         UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- 3.4 Follows (Directed Graph Edge: follower_id -> following_id)
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

-- 3.5 Notifications (Ordered chronologically for FIFO Queue processing)
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            public.activity_type NOT NULL,
  post_id         UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  is_read         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);
CREATE INDEX IF NOT EXISTS idx_posts_author_created ON public.posts (author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_desc ON public.posts (created_at DESC) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_parent_id ON public.posts (parent_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_posts_root_id ON public.posts (root_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_posts_repost_of ON public.posts (repost_of_id) WHERE repost_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_hashtags_gin ON public.posts USING GIN (hashtags);
CREATE INDEX IF NOT EXISTS idx_likes_post_id ON public.likes (post_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON public.notifications (recipient_id, created_at ASC);

-- 5. Trigger Functions

-- 5.1 Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_posts_updated_at ON public.posts;
CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5.2 Auto-create profile row when a new auth.users record is created (OAuth or Email OTP)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_username TEXT;
  candidate     TEXT;
  suffix        INTEGER := 0;
BEGIN
  base_username := lower(regexp_replace(
    COALESCE(
      NEW.raw_user_meta_data->>'preferred_username',
      NEW.raw_user_meta_data->>'user_name',
      split_part(NEW.email, '@', 1),
      'user'
    ),
    '[^a-z0-9_.]', '', 'g'
  ));

  IF char_length(base_username) < 3 THEN
    base_username := base_username || substr(replace(NEW.id::TEXT, '-', ''), 1, 5);
  END IF;
  base_username := left(base_username, 24);
  candidate := base_username;

  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = candidate) LOOP
    suffix := suffix + 1;
    candidate := left(base_username, 24) || suffix::TEXT;
  END LOOP;

  INSERT INTO public.profiles (id, username, full_name, avatar_url)
  VALUES (
    NEW.id,
    candidate,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', candidate),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5.3 Maintain likes_count & create notification
CREATE OR REPLACE FUNCTION public.handle_like_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  post_owner UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id
      RETURNING author_id INTO post_owner;
    IF post_owner IS NOT NULL AND post_owner <> NEW.user_id THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
      VALUES (post_owner, NEW.user_id, 'like', NEW.post_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_likes_counter ON public.likes;
CREATE TRIGGER trg_likes_counter
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.handle_like_change();

-- 5.4 Maintain replies_count, reposts_count & notifications
CREATE OR REPLACE FUNCTION public.handle_post_counter_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_owner UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NOT NULL THEN
      UPDATE public.posts SET replies_count = replies_count + 1 WHERE id = NEW.parent_id
        RETURNING author_id INTO target_owner;
      IF target_owner IS NOT NULL AND target_owner <> NEW.author_id THEN
        INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
        VALUES (target_owner, NEW.author_id, 'reply', NEW.id);
      END IF;
    END IF;

    IF NEW.repost_of_id IS NOT NULL THEN
      UPDATE public.posts SET reposts_count = reposts_count + 1 WHERE id = NEW.repost_of_id
        RETURNING author_id INTO target_owner;
      IF target_owner IS NOT NULL AND target_owner <> NEW.author_id THEN
        INSERT INTO public.notifications (recipient_id, actor_id, type, post_id)
        VALUES (target_owner, NEW.author_id, 'repost', NEW.repost_of_id);
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.parent_id IS NOT NULL THEN
      UPDATE public.posts SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = OLD.parent_id;
    END IF;
    IF OLD.repost_of_id IS NOT NULL THEN
      UPDATE public.posts SET reposts_count = GREATEST(reposts_count - 1, 0) WHERE id = OLD.repost_of_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_counter ON public.posts;
CREATE TRIGGER trg_posts_counter
  AFTER INSERT OR DELETE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_post_counter_change();

-- 5.5 Maintain followers_count / following_count & follow notification
CREATE OR REPLACE FUNCTION public.handle_follow_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
    INSERT INTO public.notifications (recipient_id, actor_id, type)
    VALUES (NEW.following_id, NEW.follower_id, 'follow');
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE public.profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follows_counter ON public.follows;
CREATE TRIGGER trg_follows_counter
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.handle_follow_change();

-- 6. Row Level Security (RLS) Policies

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (TRUE);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Posts RLS
CREATE POLICY "Posts are viewable by everyone"
  ON public.posts FOR SELECT USING (TRUE);

CREATE POLICY "Authenticated users can create posts"
  ON public.posts FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own posts"
  ON public.posts FOR UPDATE USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete own posts"
  ON public.posts FOR DELETE USING (auth.uid() = author_id);

-- Likes RLS
CREATE POLICY "Likes are viewable by everyone"
  ON public.likes FOR SELECT USING (TRUE);

CREATE POLICY "Users can like posts as themselves"
  ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike own likes"
  ON public.likes FOR DELETE USING (auth.uid() = user_id);

-- Follows RLS
CREATE POLICY "Follows are viewable by everyone"
  ON public.follows FOR SELECT USING (TRUE);

CREATE POLICY "Users can follow as themselves"
  ON public.follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow own edges"
  ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- Notifications RLS
CREATE POLICY "Users can view only their own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = recipient_id);

CREATE POLICY "Users can mark own notifications as read"
  ON public.notifications FOR UPDATE USING (auth.uid() = recipient_id) WITH CHECK (auth.uid() = recipient_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE USING (auth.uid() = recipient_id);

-- 7. Supabase Storage Buckets & Policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('thread-media', 'thread-media', TRUE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('avatars', 'avatars', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- thread-media bucket policies (path convention: <user_id>/<uuid>.<ext>)
CREATE POLICY "Public read access for thread-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thread-media');

CREATE POLICY "Authenticated users upload to own thread-media folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'thread-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "Users delete own thread-media files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'thread-media'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- avatars bucket policies (path convention: <user_id>/<filename>)
CREATE POLICY "Public read access for avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- 8. Enable Supabase Realtime for live notifications and feed updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
