'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Clock, Cpu, Database, Layers, Trash2, X } from 'lucide-react';
import { useDsaInspector } from '@/context/dsa-inspector-context';

export function DsaInspectorDrawer() {
  const { isOpen, closeDrawer, latest, history, clearHistory } = useDsaInspector();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-[380px] bg-threads-surface border-l border-threads-border z-50 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-threads-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">DSA Complexity Inspector</h2>
                  <p className="text-[11px] text-threads-muted">Live C++17 / WASM Telemetry</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="p-1.5 rounded-lg text-threads-muted hover:text-threads-text hover:bg-threads-hover transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Active Operation Card */}
            <div className="p-5 border-b border-threads-border">
              <div className="text-[11px] uppercase tracking-wider text-threads-muted font-medium mb-3">
                Active Operation
              </div>
              {latest ? (
                <div className="space-y-3 rounded-2xl bg-threads-bg border border-threads-border p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400">
                      {latest.action}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-threads-elevated border border-threads-border text-threads-muted">
                      {latest.runtime}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-threads-surface border border-threads-border p-3">
                      <div className="flex items-center gap-1.5 text-[11px] text-threads-muted mb-1">
                        <Clock className="w-3.5 h-3.5" />
                        Execution Time
                      </div>
                      <div className="text-base font-mono font-semibold text-threads-text">
                        {latest.execution_time_ms.toFixed(3)} ms
                      </div>
                    </div>

                    <div className="rounded-xl bg-threads-surface border border-threads-border p-3">
                      <div className="flex items-center gap-1.5 text-[11px] text-threads-muted mb-1">
                        <Database className="w-3.5 h-3.5" />
                        Input Size (N)
                      </div>
                      <div className="text-base font-mono font-semibold text-threads-text">
                        {latest.item_count}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-threads-surface border border-threads-border p-3 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-threads-muted flex items-center gap-1.5 shrink-0">
                        <Layers className="w-3.5 h-3.5" />
                        Structure
                      </span>
                      <span className="font-medium text-right">{latest.data_structure}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-threads-muted">Time Complexity</span>
                      <span className="font-mono text-amber-400">{latest.time_complexity}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-threads-muted">Space Complexity</span>
                      <span className="font-mono text-sky-400">{latest.space_complexity}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-threads-bg border border-threads-border p-5 text-center text-xs text-threads-muted">
                  Interact with the Feed, Search, Thread Replies, Activity, or Profile Mutuals to inspect live DSA execution metrics.
                </div>
              )}
            </div>

            {/* Execution History */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] uppercase tracking-wider text-threads-muted font-medium flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  Execution Log ({history.length})
                </span>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="text-[11px] text-threads-muted hover:text-threads-text flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {history.map((item, idx) => (
                  <div
                    key={`${item.timestamp}-${idx}`}
                    className="rounded-xl bg-threads-bg border border-threads-border px-3.5 py-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-threads-text">{item.action}</span>
                      <span className="font-mono text-emerald-400">
                        {item.execution_time_ms.toFixed(3)} ms
                      </span>
                    </div>
                    <div className="text-[11px] text-threads-muted mt-0.5 truncate">
                      {item.data_structure}
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[10px] font-mono text-threads-muted">
                      <span>Time: {item.time_complexity}</span>
                      <span>Space: {item.space_complexity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
