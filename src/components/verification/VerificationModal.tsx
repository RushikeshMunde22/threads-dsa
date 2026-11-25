'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BadgeCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Profile, VerificationRequest } from '@/types/database';

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  onStatusChange?: () => void;
}

const CATEGORIES = [
  'Creator & Digital Influencer',
  'Software Engineer & Tech Founder',
  'Business, Brand & Enterprise',
  'Journalist & News Media',
  'Researcher & Academic',
  'Public Figure & Community Leader',
];

const DOCUMENT_TYPES = [
  'Government Issued ID / Passport',
  'Official Company / Work Badge',
  'Verified Domain / Official Website',
  'GitHub / LinkedIn / Professional Portfolio',
];

export function VerificationModal({
  isOpen,
  onClose,
  profile,
  onStatusChange,
}: VerificationModalProps) {
  const [existingRequest, setExistingRequest] = useState<VerificationRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form State
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [socialLink, setSocialLink] = useState(profile?.website || '');
  const [additionalInfo, setAdditionalInfo] = useState('');

  useEffect(() => {
    if (!isOpen || !profile) return;
    setFullName(profile.full_name || '');
    setEmail(profile.email || '');

    async function checkExistingRequest() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('verification_requests')
          .select('*')
          .eq('user_id', profile!.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('Error fetching verification status:', error);
        } else if (data) {
          setExistingRequest(data as VerificationRequest);
        }
      } finally {
        setLoading(false);
      }
    }

    checkExistingRequest();
  }, [isOpen, profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!fullName.trim() || !email.trim()) {
      setError('Full name and email are mandatory.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data, error: insertErr } = await supabase
        .from('verification_requests')
        .insert({
          user_id: profile.id,
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          category,
          document_type: documentType,
          social_link: socialLink.trim() || null,
          additional_info: additionalInfo.trim() || null,
          status: 'pending',
        })
        .select('*')
        .single();

      if (insertErr) throw insertErr;

      setExistingRequest(data as VerificationRequest);
      setSuccess(true);
      onStatusChange?.();
    } catch (err: any) {
      console.error('Submit verification error:', err);
      setError(err?.message || 'Failed to submit application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] my-6 rounded-3xl bg-threads-surface border border-threads-border shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-threads-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <BadgeCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-threads-text tracking-tight">
                    Apply for Verified Badge
                  </h2>
                  <p className="text-[11px] text-threads-muted">
                    Official Verification Tick Mark (24/7 Review SLA)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-full text-threads-muted hover:text-threads-text hover:bg-threads-hover transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-threads-muted">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  <p className="text-xs">Checking verification eligibility...</p>
                </div>
              ) : profile?.is_verified ? (
                /* Already Verified State */
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    <BadgeCheck className="w-9 h-9" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-threads-text">
                      You are an Officially Verified Creator
                    </h3>
                    <p className="text-xs sm:text-sm text-threads-muted max-w-sm mx-auto">
                      Your profile @{profile.username} carries the authentic verification badge across Threads search, feeds, and reply trees.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-xl bg-threads-text text-threads-bg text-sm font-semibold hover:opacity-90 transition"
                  >
                    Got it
                  </button>
                </div>
              ) : existingRequest?.status === 'pending' || success ? (
                /* Application Under Review State */
                <div className="text-center py-6 space-y-5">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto">
                    <Clock className="w-8 h-8 animate-pulse" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-semibold">
                      <Clock className="w-3.5 h-3.5" />
                      Pending Administrator Review
                    </div>
                    <h3 className="text-lg font-bold text-threads-text">
                      Your Application Has Been Submitted
                    </h3>
                    <p className="text-xs sm:text-sm text-threads-muted max-w-md mx-auto leading-relaxed">
                      Our administrative team operates a <strong>24/7 review queue</strong>. Your credentials and identity details will be reviewed within 24 hours. Once approved, the tick mark will immediately appear next to your handle.
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-threads-elevated/40 border border-threads-border text-left space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-threads-muted">Applicant Name:</span>
                      <span className="font-semibold">{existingRequest?.full_name || fullName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-threads-muted">Category:</span>
                      <span className="font-semibold text-emerald-400">
                        {existingRequest?.category || category}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-threads-muted">Document Type:</span>
                      <span className="font-semibold">
                        {existingRequest?.document_type || documentType}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-threads-muted">Submitted:</span>
                      <span>
                        {existingRequest?.created_at
                          ? new Date(existingRequest.created_at).toLocaleString()
                          : 'Just now'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full py-2.5 rounded-xl bg-threads-text text-threads-bg text-sm font-semibold hover:opacity-90 transition"
                  >
                    Close & Return to Feed
                  </button>
                </div>
              ) : (
                /* New Application Form */
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                      {error}
                    </div>
                  )}

                  {/* 24/7 SLA Guarantee Callout */}
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-semibold text-emerald-400">
                        24/7 Fast-Track Review Service
                      </p>
                      <p className="text-threads-muted mt-0.5 leading-relaxed">
                        Every request is evaluated by human administrators on our dashboard within 24 hours of submission.
                      </p>
                    </div>
                  </div>

                  {/* Basic Information */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-threads-muted block mb-1">
                        Full Legal / Brand Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Rushikesh Munde"
                        className="w-full rounded-xl bg-threads-elevated border border-threads-border px-3 py-2 text-sm text-threads-text focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-threads-muted block mb-1">
                        Contact Email ID *
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full rounded-xl bg-threads-elevated border border-threads-border px-3 py-2 text-sm text-threads-text focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  </div>

                  {/* Category Selection */}
                  <div>
                    <label className="text-xs text-threads-muted block mb-1">
                      Professional Category *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full rounded-xl bg-threads-elevated border border-threads-border px-3 py-2 text-sm text-threads-text focus:outline-none focus:border-emerald-500/50"
                    >
                      {CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Document / Identity Proof Type */}
                  <div>
                    <label className="text-xs text-threads-muted block mb-1">
                      Identity Verification Proof Type *
                    </label>
                    <select
                      value={documentType}
                      onChange={(e) => setDocumentType(e.target.value)}
                      className="w-full rounded-xl bg-threads-elevated border border-threads-border px-3 py-2 text-sm text-threads-text focus:outline-none focus:border-emerald-500/50"
                    >
                      {DOCUMENT_TYPES.map((doc) => (
                        <option key={doc} value={doc}>
                          {doc}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Official Link / Social Proof */}
                  <div>
                    <label className="text-xs text-threads-muted block mb-1">
                      Official Website, GitHub, or LinkedIn URL
                    </label>
                    <input
                      type="url"
                      value={socialLink}
                      onChange={(e) => setSocialLink(e.target.value)}
                      placeholder="https://github.com/... or https://yourdomain.com"
                      className="w-full rounded-xl bg-threads-elevated border border-threads-border px-3 py-2 text-sm text-threads-text focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  {/* Additional Motivation / Info */}
                  <div>
                    <label className="text-xs text-threads-muted block mb-1">
                      Additional Information / Public Significance
                    </label>
                    <textarea
                      rows={3}
                      maxLength={400}
                      value={additionalInfo}
                      onChange={(e) => setAdditionalInfo(e.target.value)}
                      placeholder="Briefly explain your public presence, work, or why your account should be verified..."
                      className="w-full rounded-xl bg-threads-elevated border border-threads-border px-3 py-2 text-sm text-threads-text resize-none focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-threads-border">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl border border-threads-border text-xs sm:text-sm text-threads-muted hover:text-threads-text hover:bg-threads-hover transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !fullName.trim() || !email.trim()}
                      className="px-5 py-2.5 rounded-xl bg-emerald-500 text-black text-xs sm:text-sm font-bold hover:bg-emerald-400 disabled:opacity-50 transition flex items-center gap-2"
                    >
                      {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Submit 24/7 Verification Application
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
