export type ActivityType = 'like' | 'reply' | 'repost' | 'follow' | 'verify';

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  bio: string;
  avatar_url: string | null;
  website: string | null;
  email?: string | null;
  is_verified: boolean;
  is_admin?: boolean;
  is_blocked?: boolean;
  followers_count: number;
  following_count: number;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: string;
  author_id: string;
  parent_id: string | null;
  root_id: string | null;
  repost_of_id: string | null;
  content: string;
  media_urls: string[];
  hashtags: string[];
  likes_count: number;
  replies_count: number;
  reposts_count: number;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  author?: Profile;
  repost_of?: Post | null;
  viewer_has_liked?: boolean;
  viewer_has_reposted?: boolean;
  dsa_score?: number;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: ActivityType;
  post_id: string | null;
  is_read: boolean;
  created_at: string;
  actor?: Profile;
  post?: Pick<Post, 'id' | 'content' | 'root_id'> | null;
}

export interface VerificationRequest {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  category: string;
  document_type: string;
  document_url?: string | null;
  social_link?: string | null;
  additional_info?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
  user?: Profile;
}

export interface DsaTelemetry {
  execution_time_ms: number;
  data_structure: string;
  time_complexity: string;
  space_complexity: string;
  action: string;
  item_count: number;
  runtime: string;
  timestamp: string;
}

export interface FlattenedTreeNode {
  id: string;
  parent_id: string;
  depth: number;
  child_count: number;
  has_next_sibling: boolean;
  ancestor_has_next: boolean[];
  dfs_order: number;
}
