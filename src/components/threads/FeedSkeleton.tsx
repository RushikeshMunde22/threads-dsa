'use client';

import React from 'react';

export function FeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y divide-threads-border">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="p-4 flex gap-3 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-threads-elevated shrink-0" />
          <div className="flex-1 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="h-3.5 w-24 rounded bg-threads-elevated" />
              <div className="h-3 w-10 rounded bg-threads-elevated" />
            </div>
            <div className="h-3.5 w-full rounded bg-threads-elevated" />
            <div className="h-3.5 w-3/4 rounded bg-threads-elevated" />
            <div className="flex gap-5 pt-2">
              <div className="h-4 w-8 rounded bg-threads-elevated" />
              <div className="h-4 w-8 rounded bg-threads-elevated" />
              <div className="h-4 w-8 rounded bg-threads-elevated" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
