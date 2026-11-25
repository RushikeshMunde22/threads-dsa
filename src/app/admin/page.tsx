'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  Check,
  CheckCircle,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
  X,
  XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import type { Profile, VerificationRequest } from '@/types/database';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [activeTab, setActiveTab] = useState<'users' | 'verifications'>('users');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [verifications, setVerifications] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'blocked' | 'admins'>('all');
  const [reqFilter, setReqFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Mutation feedback
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsAdmin(false);
        return;
      }

      // Check admin status
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      const userIsAdmin =
        Boolean(myProfile?.is_admin) ||
        user.email === 'munderushikesh66@gmail.com' ||
        myProfile?.username === 'munderushikesh66';

      setCurrentUser(myProfile as Profile);
      setIsAdmin(userIsAdmin);

      if (!userIsAdmin) return;

      // 1. Fetch all registered users
      const { data: allUsers, error: usersErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersErr) console.error('Fetch users error:', usersErr);
      else setProfiles((allUsers ?? []) as Profile[]);

      // 2. Fetch all verification applications
      const { data: allReqs, error: reqErr } = await supabase
        .from('verification_requests')
        .select('*, user:profiles!verification_requests_user_id_fkey(*)')
        .order('created_at', { ascending: false });

      if (reqErr) console.error('Fetch verification requests error:', reqErr);
      else setVerifications((allReqs ?? []) as VerificationRequest[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Authority 1: Toggle Verification Tick Mark
  const handleToggleVerify = async (targetUser: Profile) => {
    setActionLoading(`verify-${targetUser.id}`);
    try {
      const supabase = createClient();
      const nextVerified = !targetUser.is_verified;

      const { data, error } = await supabase.rpc('admin_toggle_verify', {
        target_user_id: targetUser.id,
        verified: nextVerified,
      });

      if (error) throw error;

      setProfiles((prev) =>
        prev.map((p) => (p.id === targetUser.id ? { ...p, is_verified: nextVerified } : p))
      );
      showToast(
        nextVerified
          ? `Verified tick mark granted to @${targetUser.username}`
          : `Verified tick mark removed from @${targetUser.username}`
      );
    } catch (err: any) {
      alert(`Action failed: ${err?.message || 'Permission denied'}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Authority 2: Block / Unblock User
  const handleToggleBlock = async (targetUser: Profile) => {
    const nextBlocked = !targetUser.is_blocked;
    const confirmPrompt = nextBlocked
      ? `Are you sure you want to BLOCK @${targetUser.username}? They will lose access to posting and engaging.`
      : `Unblock @${targetUser.username}?`;

    if (!confirm(confirmPrompt)) return;

    setActionLoading(`block-${targetUser.id}`);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('admin_toggle_block', {
        target_user_id: targetUser.id,
        blocked: nextBlocked,
      });

      if (error) throw error;

      setProfiles((prev) =>
        prev.map((p) => (p.id === targetUser.id ? { ...p, is_blocked: nextBlocked } : p))
      );
      showToast(
        nextBlocked
          ? `@${targetUser.username} has been BLOCKED.`
          : `@${targetUser.username} has been UNBLOCKED.`
      );
    } catch (err: any) {
      alert(`Action failed: ${err?.message || 'Permission denied'}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Authority 3: Review Verification Application (Grant or Reject Tick)
  const handleReviewRequest = async (reqId: string, newStatus: 'approved' | 'rejected') => {
    setActionLoading(`review-${reqId}`);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('admin_review_verification', {
        req_id: reqId,
        new_status: newStatus,
        notes: newStatus === 'approved' ? 'Verified by Administrator' : 'Application declined',
      });

      if (error) throw error;

      setVerifications((prev) =>
        prev.map((r) => (r.id === reqId ? { ...r, status: newStatus } : r))
      );

      // If approved, update profile in local state
      const targetReq = verifications.find((r) => r.id === reqId);
      if (targetReq && newStatus === 'approved') {
        setProfiles((prev) =>
          prev.map((p) => (p.id === targetReq.user_id ? { ...p, is_verified: true } : p))
        );
      }

      showToast(
        newStatus === 'approved'
          ? 'Application APPROVED! Tick mark granted.'
          : 'Application REJECTED.'
      );
    } catch (err: any) {
      alert(`Action failed: ${err?.message || 'Permission denied'}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered users list
  const filteredUsers = profiles.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      p.username.toLowerCase().includes(q) ||
      p.full_name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q);

    if (!matchSearch) return false;

    if (statusFilter === 'verified') return p.is_verified;
    if (statusFilter === 'blocked') return p.is_blocked;
    if (statusFilter === 'admins') return p.is_admin;
    return true;
  });

  // Filtered verification requests
  const filteredRequests = verifications.filter((r) => {
    if (reqFilter === 'all') return true;
    return r.status === reqFilter;
  });

  const pendingCount = verifications.filter((r) => r.status === 'pending').length;

  return (
    <AppShell title="Admin Command Center">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 px-4 py-2.5 rounded-2xl bg-emerald-500 text-black font-semibold text-xs shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="w-4 h-4" />
          {toastMsg}
        </div>
      )}

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3 text-threads-muted">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          <p className="text-sm font-medium">Authenticating administrator privileges...</p>
        </div>
      ) : isAdmin === false ? (
        /* Access Denied Shield */
        <div className="p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 text-red-400 border border-red-500/30 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-threads-text">
              Restricted Authority
            </h2>
            <p className="text-xs sm:text-sm text-threads-muted max-w-md mx-auto">
              This console requires designated Administrator privileges. Access is restricted to platform operators.
            </p>
          </div>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-threads-text text-threads-bg text-xs font-semibold hover:opacity-90 transition"
          >
            Return to Feed
          </Link>
        </div>
      ) : (
        /* Administrator Dashboard */
        <div className="p-4 sm:p-6 space-y-6">
          {/* Top Admin Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-threads-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-threads-text tracking-tight">
                    Platform Admin Dashboard
                  </h2>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono uppercase font-bold">
                    SuperAdmin
                  </span>
                </div>
                <p className="text-xs text-threads-muted">
                  Logged in as <strong className="text-threads-text">{currentUser?.email || `@${currentUser?.username}`}</strong>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setRefreshing(true);
                loadAdminData();
              }}
              disabled={refreshing}
              className="px-3 py-1.5 rounded-xl border border-threads-border text-xs text-threads-muted hover:text-threads-text hover:bg-threads-hover flex items-center gap-1.5 transition self-end sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-threads-elevated/40 border border-threads-border space-y-1">
              <div className="flex items-center justify-between text-xs text-threads-muted">
                <span>Total Users</span>
                <Users className="w-4 h-4 text-sky-400" />
              </div>
              <div className="text-2xl font-bold text-threads-text">{profiles.length}</div>
            </div>

            <div className="p-4 rounded-2xl bg-threads-elevated/40 border border-threads-border space-y-1">
              <div className="flex items-center justify-between text-xs text-threads-muted">
                <span>Verified Badges</span>
                <BadgeCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-400">
                {profiles.filter((p) => p.is_verified).length}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-threads-elevated/40 border border-threads-border space-y-1">
              <div className="flex items-center justify-between text-xs text-threads-muted">
                <span>24/7 Tick Queue</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-amber-400">{pendingCount}</div>
            </div>

            <div className="p-4 rounded-2xl bg-threads-elevated/40 border border-threads-border space-y-1">
              <div className="flex items-center justify-between text-xs text-threads-muted">
                <span>Blocked Users</span>
                <UserX className="w-4 h-4 text-red-400" />
              </div>
              <div className="text-2xl font-bold text-red-400">
                {profiles.filter((p) => p.is_blocked).length}
              </div>
            </div>
          </div>

          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-threads-border pb-1">
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 ${
                activeTab === 'users'
                  ? 'bg-threads-text text-threads-bg'
                  : 'text-threads-muted hover:text-threads-text hover:bg-threads-hover'
              }`}
            >
              <Users className="w-4 h-4" />
              Users & Permissions ({profiles.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('verifications')}
              className={`relative px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-2 ${
                activeTab === 'verifications'
                  ? 'bg-threads-text text-threads-bg'
                  : 'text-threads-muted hover:text-threads-text hover:bg-threads-hover'
              }`}
            >
              <BadgeCheck className="w-4 h-4" />
              24/7 Tick Applications
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </button>
          </div>

          {/* TAB 1: ALL PERSONS & USERS MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Search & Filter Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-threads-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by @username, full name, or email ID..."
                    className="w-full rounded-xl bg-threads-bg border border-threads-border pl-10 pr-4 py-2 text-xs sm:text-sm text-threads-text placeholder:text-threads-muted focus:outline-none focus:border-threads-muted"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  {(['all', 'verified', 'blocked', 'admins'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setStatusFilter(filter)}
                      className={`px-3 py-1.5 rounded-xl capitalize text-xs transition shrink-0 ${
                        statusFilter === filter
                          ? 'bg-threads-elevated border border-threads-text text-threads-text font-semibold'
                          : 'border border-threads-border text-threads-muted hover:text-threads-text'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              {/* Users List Table / Responsive Cards */}
              <div className="border border-threads-border rounded-2xl overflow-hidden divide-y divide-threads-border bg-threads-bg">
                {filteredUsers.length === 0 ? (
                  <div className="p-10 text-center text-xs text-threads-muted">
                    No users matching criteria.
                  </div>
                ) : (
                  filteredUsers.map((user) => {
                    const isSelf = user.id === currentUser?.id;
                    const isBusyVerify = actionLoading === `verify-${user.id}`;
                    const isBusyBlock = actionLoading === `block-${user.id}`;

                    return (
                      <div
                        key={user.id}
                        className={`p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition ${
                          user.is_blocked ? 'bg-red-500/5' : 'hover:bg-threads-hover/40'
                        }`}
                      >
                        {/* User Identity Column */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative shrink-0">
                            <div className="w-11 h-11 rounded-full overflow-hidden border border-threads-border bg-threads-elevated flex items-center justify-center font-bold text-sm">
                              {user.avatar_url ? (
                                <img
                                  src={user.avatar_url}
                                  alt={user.username}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                (user.username[0] || 'U').toUpperCase()
                              )}
                            </div>
                            {user.is_verified && (
                              <BadgeCheck
                                className="w-4 h-4 text-emerald-400 absolute -bottom-0.5 -right-0.5 fill-black"
                              />
                            )}
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Link
                                href={`/profile/${user.username}`}
                                className="text-sm font-bold hover:underline text-threads-text truncate"
                              >
                                @{user.username}
                              </Link>
                              {user.is_admin && (
                                <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono border border-purple-500/30">
                                  ADMIN
                                </span>
                              )}
                              {user.is_blocked && (
                                <span className="px-1.5 py-0.2 rounded bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30">
                                  BLOCKED
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-threads-muted truncate">
                              {user.full_name || 'No full name provided'}
                            </div>

                            {/* Email ID Display */}
                            <div className="flex items-center gap-1 text-[11px] text-sky-400 font-mono">
                              <Mail className="w-3 h-3 shrink-0" />
                              <span className="truncate">{user.email || 'No email attached'}</span>
                            </div>
                          </div>
                        </div>

                        {/* User Stats & Action Buttons */}
                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
                          <div className="text-right text-[11px] text-threads-muted hidden md:block mr-2">
                            <div>{user.followers_count} followers</div>
                            <div>Joined {new Date(user.created_at).toLocaleDateString()}</div>
                          </div>

                          {/* Give / Revoke Verified Tick Mark */}
                          <button
                            type="button"
                            onClick={() => handleToggleVerify(user)}
                            disabled={isBusyVerify}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                              user.is_verified
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                                : 'bg-threads-surface border border-threads-border text-threads-muted hover:text-threads-text hover:border-threads-muted'
                            }`}
                            title={user.is_verified ? 'Revoke verification badge' : 'Grant verification badge'}
                          >
                            {isBusyVerify ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <BadgeCheck className="w-3.5 h-3.5" />
                            )}
                            {user.is_verified ? 'Verified Tick ✓' : 'Give Tick'}
                          </button>

                          {/* Authority to Block / Unblock User */}
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => handleToggleBlock(user)}
                              disabled={isBusyBlock}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                                user.is_blocked
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25'
                                  : 'border border-red-500/30 text-red-400 hover:bg-red-500/10'
                              }`}
                              title={user.is_blocked ? 'Unblock user' : 'Suspend / block user account'}
                            >
                              {isBusyBlock ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : user.is_blocked ? (
                                <UserCheck className="w-3.5 h-3.5" />
                              ) : (
                                <UserX className="w-3.5 h-3.5" />
                              )}
                              {user.is_blocked ? 'Unblock' : 'Block User'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: VERIFICATION REQUESTS (24/7 TICK APPLICATIONS) */}
          {activeTab === 'verifications' && (
            <div className="space-y-4">
              {/* Filter Tabs */}
              <div className="flex items-center gap-2">
                {(['pending', 'approved', 'rejected', 'all'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setReqFilter(filter)}
                    className={`px-3.5 py-1.5 rounded-xl capitalize text-xs transition ${
                      reqFilter === filter
                        ? 'bg-threads-elevated border border-threads-text text-threads-text font-semibold'
                        : 'border border-threads-border text-threads-muted hover:text-threads-text'
                    }`}
                  >
                    {filter}
                    {filter === 'pending' && pendingCount > 0 && ` (${pendingCount})`}
                  </button>
                ))}
              </div>

              {/* Request Cards */}
              <div className="space-y-3">
                {filteredRequests.length === 0 ? (
                  <div className="p-12 text-center text-xs text-threads-muted border border-threads-border rounded-2xl bg-threads-bg">
                    No {reqFilter} applications in the queue.
                  </div>
                ) : (
                  filteredRequests.map((req) => {
                    const isBusy = actionLoading === `review-${req.id}`;
                    const isPending = req.status === 'pending';

                    return (
                      <div
                        key={req.id}
                        className="p-5 rounded-2xl bg-threads-bg border border-threads-border space-y-4"
                      >
                        {/* Header: User identity + status */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden border border-threads-border bg-threads-elevated flex items-center justify-center font-bold text-sm">
                              {req.user?.avatar_url ? (
                                <img
                                  src={req.user.avatar_url}
                                  alt={req.user.username}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                (req.user?.username?.[0] || 'U').toUpperCase()
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-threads-text">
                                  {req.full_name}
                                </span>
                                <Link
                                  href={`/profile/${req.user?.username}`}
                                  className="text-xs text-emerald-400 hover:underline"
                                >
                                  @{req.user?.username}
                                </Link>
                              </div>
                              <div className="text-xs text-threads-muted flex items-center gap-2 mt-0.5">
                                <span className="text-sky-400 font-mono">{req.email}</span>
                                <span>·</span>
                                <span>Applied {new Date(req.created_at).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {req.status === 'pending' && (
                              <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-semibold flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                24/7 Pending
                              </span>
                            )}
                            {req.status === 'approved' && (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                Approved & Verified
                              </span>
                            )}
                            {req.status === 'rejected' && (
                              <span className="px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-semibold flex items-center gap-1">
                                <X className="w-3 h-3" />
                                Rejected
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-threads-elevated/30 border border-threads-border text-xs">
                          <div>
                            <span className="text-threads-muted block text-[11px]">Category</span>
                            <span className="font-semibold text-threads-text">{req.category}</span>
                          </div>
                          <div>
                            <span className="text-threads-muted block text-[11px]">Proof Type</span>
                            <span className="font-semibold text-threads-text">
                              {req.document_type}
                            </span>
                          </div>
                          <div>
                            <span className="text-threads-muted block text-[11px]">Official URL</span>
                            {req.social_link ? (
                              <a
                                href={req.social_link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-400 hover:underline inline-flex items-center gap-1 truncate max-w-full font-mono text-[11px]"
                              >
                                {req.social_link.replace(/^https?:\/\//, '')}
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            ) : (
                              <span className="text-threads-muted">Not provided</span>
                            )}
                          </div>
                        </div>

                        {/* Additional info / motivation */}
                        {req.additional_info && (
                          <div className="text-xs text-threads-muted bg-threads-elevated/20 p-3 rounded-xl border border-threads-border/60">
                            <strong className="text-threads-text block mb-1">
                              Applicant Statement:
                            </strong>
                            <p className="whitespace-pre-wrap">{req.additional_info}</p>
                          </div>
                        )}

                        {/* Authority Action Buttons */}
                        {isPending && (
                          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-threads-border">
                            <button
                              type="button"
                              onClick={() => handleReviewRequest(req.id, 'rejected')}
                              disabled={isBusy}
                              className="px-4 py-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-semibold transition flex items-center gap-1.5"
                            >
                              <XCircle className="w-4 h-4" />
                              Decline Request
                            </button>

                            <button
                              type="button"
                              onClick={() => handleReviewRequest(req.id, 'approved')}
                              disabled={isBusy}
                              className="px-5 py-2 rounded-xl bg-emerald-500 text-black text-xs font-bold hover:bg-emerald-400 transition flex items-center gap-1.5"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <BadgeCheck className="w-4 h-4" />
                              )}
                              Approve & Grant Verified Tick
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
