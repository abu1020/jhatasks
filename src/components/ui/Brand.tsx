import React from 'react';

export function BrandMark({
  size = 40,
  className = '',
  title = 'Cadence',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[30%] bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 text-white shadow-[0_5px_16px_rgba(79,70,229,0.28)] ring-1 ring-white/20 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48" width={size * 0.72} height={size * 0.72} fill="none" aria-label={title}>
        <path
          d="M7.5 25h9l4.2-9.5 7.1 18 5.1-12H41"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="37.5" cy="13" r="3.5" fill="#A7F3D0" stroke="#fff" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

export function BrandLockup({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={compact ? 34 : 40} />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="font-display text-[17px] font-extrabold tracking-[-0.055em] text-[var(--text-1)] sm:text-lg">
          cadence<span className="text-[var(--accent)]">.</span>
        </span>
        {!compact && (
          <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.19em] text-[var(--text-3)]">
            Focus, in rhythm
          </span>
        )}
      </span>
    </span>
  );
}
