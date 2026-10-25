import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown, X } from 'lucide-react';
import {
  PRIORITY_META,
  type PriorityLevel,
  type WorkspaceType,
} from '../../db/schema';
import { getTagChipStyle } from '../../lib/dateUtils';
import { DETERMINISTIC_PARTICLES } from '../../lib/soundAndParticles';
import { useCadenceStore } from '../../store/useCadenceStore';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  dotColor?: string;
  icon?: React.ReactNode;
}

interface CustomSelectProps<T extends string = string> {
  value: T;
  onChange: (val: T) => void;
  options: SelectOption<T>[];
  ariaLabel: string;
  className?: string;
  size?: 'sm' | 'md';
  prefix?: React.ReactNode;
}

/**
 * Custom Combobox / Listbox Select rendered in a Portal (never native <select>).
 * Uses opaque .popover-surface, flips above when needed, clamps 8px to viewport edges,
 * repositions on capture-phase scroll & resize, and supports full keyboard navigation.
 */
export function CustomSelect<T extends string = string>({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
  size = 'md',
  prefix,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    Math.max(0, options.findIndex((o) => o.value === value))
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 180,
  });
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  const selectedOption = options.find((o) => o.value === value) || options[0];

  const updatePosition = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const desiredWidth = Math.min(Math.max(rect.width, 168), vw - 16);
    const estHeight = Math.min(options.length * 38 + 12, 264);

    let top = rect.bottom + 6;
    if (top + estHeight > vh - 8 && rect.top - estHeight - 6 >= 8) {
      top = rect.top - estHeight - 6;
    } else if (top + estHeight > vh - 8) {
      top = Math.max(8, vh - estHeight - 8);
    }

    const left = Math.max(8, Math.min(rect.left, vw - desiredWidth - 8));
    setCoords({ top, left, width: desiredWidth });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const idx = options.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);

    const handleReposition = () => updatePosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, value, options.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        listboxRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + options.length) % options.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const chosen = options[activeIndex];
      if (chosen) {
        onChange(chosen.value);
      }
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const activeOptionId = open ? `${baseId}-opt-${activeIndex}` : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onKeyDown={handleKeyDown}
        className={`btn-ghost inline-flex items-center justify-between gap-2 rounded-xl font-medium whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          size === 'sm' ? 'px-2.5 py-1.5 text-xs min-h-[34px]' : 'px-3 py-2 text-xs min-h-[40px]'
        } ${className}`}
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          {prefix}
          {selectedOption?.dotColor && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: selectedOption.dotColor }}
            />
          )}
          {selectedOption?.icon}
          <span className="truncate">{selectedOption?.label}</span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--text-3)] shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxHeight: 264,
              zIndex: 120,
            }}
            className="popover-surface rounded-xl p-1 overflow-y-auto focus:outline-none"
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isActive = idx === activeIndex;
              return (
                <div
                  key={opt.value}
                  id={`${baseId}-opt-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(opt.value);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer select-none transition-colors ${
                    isActive
                      ? 'bg-[var(--surface-3)] text-[var(--text-1)]'
                      : 'text-[var(--text-2)] hover:bg-[var(--surface-1)]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 truncate">
                    {opt.dotColor && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: opt.dotColor }}
                      />
                    )}
                    {opt.icon}
                    <span className={isSelected ? 'font-semibold text-[var(--text-1)]' : ''}>
                      {opt.label}
                    </span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * Segmented Control
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'md',
}: {
  value: T;
  onChange: (val: T) => void;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center p-1 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] shrink-0"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-lg font-medium whitespace-nowrap shrink-0 transition-all ${
              size === 'sm' ? 'px-2.5 py-1 text-xs min-h-[30px]' : 'px-3 py-1.5 text-xs min-h-[34px]'
            } ${
              active
                ? 'bg-[var(--surface-2)] text-[var(--text-1)] shadow-xs border border-[var(--border)]'
                : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Circular Progress Ring
 */
export function ProgressRing({
  percentage,
  size = 28,
  strokeWidth = 3,
  label,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percentage));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      aria-label={label || `${clamped}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      </svg>
    </div>
  );
}

/**
 * Linear Progress Bar
 */
export function ProgressBar({
  value,
  max = 100,
  color = 'var(--accent)',
  height = 6,
}: {
  value: number;
  max?: number;
  color?: string;
  height?: number;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  return (
    <div
      className="w-full rounded-full overflow-hidden bg-[var(--surface-3)]"
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

/**
 * Priority Badge (always uses WORDS: Urgent / High / Medium / Low or Urg / High / Med / Low — NEVER P1/P2)
 */
export function PriorityBadge({
  priority,
  short = false,
  onClick,
}: {
  priority: PriorityLevel;
  short?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const meta = PRIORITY_META[priority] || PRIORITY_META[4];
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Priority: ${meta.label}. Click to cycle priority`}
        style={{
          color: meta.color,
          backgroundColor: meta.bg,
          borderColor: meta.border,
        }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap shrink-0 hover:brightness-110 transition"
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
        <span>{short ? meta.shortLabel : meta.label}</span>
      </button>
    );
  }
  return (
    <span
      style={{ color: meta.color }}
      className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap shrink-0"
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      <span>{short ? meta.shortLabel : meta.label}</span>
    </span>
  );
}

/**
 * Deterministic Pastel Tag Chip
 */
export function TagChip({
  tag,
  onRemove,
  onClick,
}: {
  tag: string;
  onRemove?: () => void;
  onClick?: () => void;
}) {
  const style = getTagChipStyle(tag);
  return (
    <span
      onClick={onClick}
      style={{
        color: style.text,
        backgroundColor: style.bg,
        borderColor: style.border,
      }}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap shrink-0 ${
        onClick ? 'cursor-pointer hover:brightness-105' : ''
      }`}
    >
      <span>#{tag}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${tag}`}
          className="hover:opacity-75"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

/**
 * Workspace Indicator
 */
export function WorkspaceDot({
  workspace,
  showLabel = false,
}: {
  workspace: WorkspaceType;
  showLabel?: boolean;
}) {
  const isOffice = workspace === 'office';
  const color = isOffice ? '#4F46E5' : '#059669';
  const label = isOffice ? 'Office' : 'Personal';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-3)] whitespace-nowrap shrink-0">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      {showLabel && <span>{label}</span>}
    </span>
  );
}

/**
 * Empty State Card with CTA
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondaryAction,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <div className="card p-8 sm:p-10 text-center max-w-lg mx-auto my-6 flex flex-col items-center">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[var(--accent-soft)] text-[var(--accent)] mb-4">
        {icon}
      </div>
      <h3 className="font-display text-lg font-semibold text-[var(--text-1)] mb-1.5 text-balance">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-3)] leading-relaxed mb-6 max-w-sm">
        {description}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="btn-accent px-4 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 min-h-[40px]"
          >
            {actionLabel}
          </button>
        )}
        {secondaryLabel && onSecondaryAction && (
          <button
            type="button"
            onClick={onSecondaryAction}
            className="btn-ghost px-4 py-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-2 min-h-[40px]"
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Responsive Modal: bottom sheet on mobile (<640px), centered dialog on >=sm.
 * Uses opaque .popover-surface.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-100 flex items-end sm:items-center justify-center sm:p-4"
          style={{ backgroundColor: 'var(--overlay)' }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            className={`popover-surface w-full ${maxWidth} rounded-t-3xl sm:rounded-2xl max-h-[92dvh] flex flex-col overflow-hidden`}
          >
            <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3.5 border-b border-[var(--border)] shrink-0">
              <div>
                <h2 className="font-display text-base font-semibold text-[var(--text-1)]">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-xs text-[var(--text-3)] mt-0.5">{subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="btn-ghost p-2 rounded-xl min-w-[38px] min-h-[38px] inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/**
 * Toast Container (bottom-20 on mobile above tab bar, bottom-6 on desktop)
 */
export function ToastViewport() {
  const toasts = useCadenceStore((s) => s.toasts);
  const dismissToast = useCadenceStore((s) => s.dismissToast);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6 bottom-20 lg:bottom-6 z-110 flex flex-col items-end gap-2.5 w-full max-w-md px-3 sm:px-0 pointer-events-none"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.16 }}
            className="popover-surface pointer-events-auto w-full rounded-2xl px-4 py-3 shadow-lg"
          >
            {t.gmailMeta ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {t.gmailMeta.category === 'otp' ? (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 shrink-0 tnum">
                        OTP · {t.gmailMeta.otpCode}
                      </span>
                    ) : t.gmailMeta.category === 'urgent' ? (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#F43F5E]/15 text-[#F43F5E] border border-[#F43F5E]/30 shrink-0">
                        GMAIL · URGENT
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                        LIVE GMAIL
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-[var(--text-2)] truncate">
                      {t.gmailMeta.sender}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissToast(t.id)}
                    aria-label="Dismiss notification"
                    className="text-[var(--text-3)] hover:text-[var(--text-1)] p-0.5 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-xs font-semibold text-[var(--text-1)] leading-snug line-clamp-1">
                  {t.gmailMeta.subject}
                </div>
                {t.gmailMeta.snippet && (
                  <p className="text-[11px] text-[var(--text-3)] line-clamp-2 leading-relaxed">
                    {t.gmailMeta.snippet}
                  </p>
                )}

                <div className="flex items-center justify-end gap-2 pt-0.5">
                  {t.secondaryActionLabel && t.onSecondaryAction && (
                    <button
                      type="button"
                      onClick={() => {
                        t.onSecondaryAction?.();
                        dismissToast(t.id);
                      }}
                      className="btn-ghost px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                    >
                      {t.secondaryActionLabel}
                    </button>
                  )}
                  {t.actionLabel && t.onAction && (
                    <button
                      type="button"
                      onClick={() => {
                        t.onAction?.();
                        dismissToast(t.id);
                      }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[var(--accent)] text-white hover:brightness-110 tnum"
                    >
                      {t.actionLabel}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-[var(--text-1)] leading-snug">
                  {t.message}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {t.actionLabel && t.onAction && (
                    <button
                      type="button"
                      onClick={() => {
                        t.onAction?.();
                        dismissToast(t.id);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[var(--accent)] text-white hover:brightness-110"
                    >
                      {t.actionLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => dismissToast(t.id)}
                    aria-label="Dismiss notification"
                    className="text-[var(--text-3)] hover:text-[var(--text-1)] p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

/**
 * Deterministic Completion Particle Overlay
 */
export function ParticleBurstOverlay() {
  const bursts = useCadenceStore((s) => s.bursts);
  if (bursts.length === 0 || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-130 overflow-hidden">
      {bursts.map((burst) => (
        <div
          key={burst.id}
          style={{ left: burst.x, top: burst.y }}
          className="absolute"
        >
          {DETERMINISTIC_PARTICLES.map((p) => (
            <motion.span
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 0.2 }}
              transition={{ duration: 0.52, delay: p.delay, ease: 'easeOut' }}
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
              }}
              className="absolute rounded-full -translate-x-1/2 -translate-y-1/2"
            />
          ))}
        </div>
      ))}
    </div>,
    document.body
  );
}
