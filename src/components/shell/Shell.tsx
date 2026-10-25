import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  BarChart3,
  Bell,
  Briefcase,
  Calendar as CalendarIcon,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Command,
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  FolderOpen,
  Grid2X2,
  Heart,
  Kanban,
  KeyRound,
  Keyboard,
  Layers,
  ListTodo,
  LogOut,
  Mail,
  Menu,
  Moon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Square,
  Sun,
  Timer,
  Upload,
  X,
} from 'lucide-react';
import type { ViewId, WorkspaceFilter } from '../../db/schema';
import { computeTodayProgress, getTodayStr } from '../../lib/dateUtils';
import {
  fetchFirestoreUserTasksAndEvents,
  fetchGmailNotificationsLive,
  fetchGoogleCalendarLiveEvents,
  fetchGoogleTasksLive,
  googleSignIn,
  logout,
} from '../../lib/firebase';
import { parseGoogleTasksV1Json, type GmailNotificationItem } from '../../lib/nlpParser';
import { useCadenceStore } from '../../store/useCadenceStore';
import { ProgressRing } from '../ui/Primitives';

export const VIEW_CONFIG: {
  id: ViewId;
  label: string;
  shortLabel: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'my_day', label: 'My Day', shortLabel: 'My Day', shortcut: '1', icon: Sparkles },
  { id: 'board', label: 'Board', shortLabel: 'Board', shortcut: '2', icon: Kanban },
  { id: 'list', label: 'List', shortLabel: 'List', shortcut: '3', icon: ListTodo },
  { id: 'calendar', label: 'Calendar', shortLabel: 'Calendar', shortcut: '4', icon: CalendarIcon },
  { id: 'matrix', label: 'Matrix', shortLabel: 'Matrix', shortcut: '5', icon: Grid2X2 },
  { id: 'insights', label: 'Insights', shortLabel: 'Insights', shortcut: '6', icon: BarChart3 },
];

export function GoogleSignInButton({
  compact = false,
  onSuccess,
}: {
  compact?: boolean;
  onSuccess?: () => void;
}) {
  const setAuthUser = useCadenceStore((s) => s.setAuthUser);
  const mergeExternalTasks = useCadenceStore((s) => s.mergeExternalTasks);
  const mergeExternalEvents = useCadenceStore((s) => s.mergeExternalEvents);
  const ingestGmailNotifications = useCadenceStore((s) => s.ingestGmailNotifications);
  const addToast = useCadenceStore((s) => s.addToast);
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    setBusy(true);
    try {
      const res = await googleSignIn();
      setAuthUser({
        uid: res.user.uid,
        email: res.user.email,
        name: res.user.displayName,
        photo: res.user.photoURL,
        hasToken: Boolean(res.accessToken),
      });
      addToast({
        message: `Signed in as ${res.user.displayName || res.user.email}`,
        tone: 'success',
      });
      if (res.accessToken) {
        fetchGmailNotificationsLive(res.user.email)
          .then((items) => {
            ingestGmailNotifications(items, { forceToastNewest: true });
          })
          .catch(() => {});
      }
      fetchFirestoreUserTasksAndEvents(res.user.uid)
        .then((cloudData) => {
          if (cloudData.tasks.length > 0) mergeExternalTasks(cloudData.tasks);
          if (cloudData.events.length > 0) mergeExternalEvents(cloudData.events);
        })
        .catch(() => {});
      onSuccess?.();
    } catch (err: any) {
      addToast({
        message: err?.message?.includes('popup')
          ? 'Google sign-in popup was closed'
          : 'Could not complete Google sign-in',
        tone: 'warning',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignIn}
      disabled={busy}
      className={`gsi-material-button inline-flex items-center justify-center gap-2.5 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-1)] hover:bg-[var(--surface-3)] transition font-medium whitespace-nowrap shrink-0 ${
        compact ? 'px-3 py-2 text-xs min-h-[38px]' : 'w-full px-3.5 py-2.5 text-xs min-h-[40px]'
      }`}
    >
      <svg
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 48"
        className="w-4 h-4 shrink-0"
      >
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
      <span>{busy ? 'Connecting...' : 'Sign in with Google'}</span>
    </button>
  );
}

/**
 * Global Focus Timer Pill (renders inside header on >=sm, or dedicated row below topbar on phones)
 */
export function FocusTimerBanner({ mobileRow = false }: { mobileRow?: boolean }) {
  const focusTimer = useCadenceStore((s) => s.focusTimer);
  const tasks = useCadenceStore((s) => s.tasks);
  const togglePause = useCadenceStore((s) => s.togglePauseFocusTimer);
  const stopTimer = useCadenceStore((s) => s.stopFocusTimer);
  const setSelectedTaskId = useCadenceStore((s) => s.setSelectedTaskId);

  if (!focusTimer.taskId) return null;
  const task = tasks.find((t) => t.id === focusTimer.taskId);
  const mins = String(Math.floor(focusTimer.secondsLeft / 60)).padStart(2, '0');
  const secs = String(focusTimer.secondsLeft % 60).padStart(2, '0');

  if (mobileRow) {
    return (
      <div className="sm:hidden flex items-center justify-between gap-2 px-3 py-2 bg-[var(--accent-soft)] border-b border-[var(--border)]">
        <button
          type="button"
          onClick={() => setSelectedTaskId(focusTimer.taskId)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          <Timer className="w-4 h-4 text-[var(--accent)] shrink-0" />
          <span className="font-mono text-xs font-bold text-[var(--accent)] tnum">
            {mins}:{secs}
          </span>
          <span className="text-xs font-medium text-[var(--text-1)] truncate">
            {focusTimer.mode === 'break' ? 'Break · ' : ''}
            {task?.title || 'Focus session'}
          </span>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={togglePause}
            aria-label={focusTimer.running ? 'Pause focus timer' : 'Resume focus timer'}
            className="btn-ghost p-1.5 rounded-lg"
          >
            {focusTimer.running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={stopTimer}
            aria-label="Stop focus timer"
            className="btn-ghost p-1.5 rounded-lg"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[var(--accent-soft)] border border-[var(--border-strong)] shrink-0">
      <button
        type="button"
        onClick={() => setSelectedTaskId(focusTimer.taskId)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-1)] max-w-[160px]"
      >
        <Timer className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
        <span className="font-mono font-bold text-[var(--accent)] tnum">
          {mins}:{secs}
        </span>
        <span className="truncate hidden md:inline">
          {focusTimer.mode === 'break' ? 'Break' : task?.title || 'Focus'}
        </span>
      </button>
      <button
        type="button"
        onClick={togglePause}
        aria-label={focusTimer.running ? 'Pause focus timer' : 'Resume focus timer'}
        className="p-1 rounded-md hover:bg-[var(--surface-3)] text-[var(--text-1)]"
      >
        {focusTimer.running ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
      </button>
      <button
        type="button"
        onClick={stopTimer}
        aria-label="Stop focus timer"
        className="p-1 rounded-md hover:bg-[var(--surface-3)] text-[var(--text-3)] hover:text-[var(--text-1)]"
      >
        <Square className="w-3 h-3" />
      </button>
    </div>
  );
}

/**
 * Gmail & OTP Notification Center Popover
 */
function NotificationsPopover({
  triggerRef,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const notificationsOpen = useCadenceStore((s) => s.notificationsOpen);
  const setNotificationsOpen = useCadenceStore((s) => s.setNotificationsOpen);
  const notifications = useCadenceStore((s) => s.notifications);
  const markNotificationRead = useCadenceStore((s) => s.markNotificationRead);
  const markAllNotificationsRead = useCadenceStore((s) => s.markAllNotificationsRead);
  const dismissNotification = useCadenceStore((s) => s.dismissNotification);
  const ingestGmailNotifications = useCadenceStore((s) => s.ingestGmailNotifications);
  const setGmailPollStatus = useCadenceStore((s) => s.setGmailPollStatus);
  const gmailPollStatus = useCadenceStore((s) => s.gmailPollStatus);
  const lastGmailPolledAt = useCadenceStore((s) => s.lastGmailPolledAt);
  const createTask = useCadenceStore((s) => s.createTask);
  const addToast = useCadenceStore((s) => s.addToast);
  const hasGoogleToken = useCadenceStore((s) => s.hasGoogleToken);
  const userEmail = useCadenceStore((s) => s.userEmail);
  const setAuthUser = useCadenceStore((s) => s.setAuthUser);

  const popRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState({ top: 60, left: 16, width: 340 });
  const [checkingGmail, setCheckingGmail] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const updatePos = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(356, vw - 16);
    const left = Math.max(8, Math.min(rect.right - width, vw - width - 8));
    const top = Math.min(rect.bottom + 8, window.innerHeight - 460);
    setCoords({ top: Math.max(8, top), left, width });
  };

  useLayoutEffect(() => {
    if (!notificationsOpen) return;
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setNotificationsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotificationsOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [notificationsOpen, setNotificationsOpen]);

  if (!notificationsOpen || typeof document === 'undefined') return null;

  const handleCheckGmailLive = async () => {
    setCheckingGmail(true);
    setGmailPollStatus('polling');
    try {
      const liveItems = await fetchGmailNotificationsLive(userEmail);
      const added = ingestGmailNotifications(liveItems, { forceToastNewest: true });
      if (added === 0 && liveItems.length > 0) {
        addToast({
          message: `Polled live Gmail (${liveItems.length} inbox threads synced)`,
          tone: 'success',
        });
      } else if (liveItems.length === 0) {
        addToast({
          message: 'Connected to live Gmail inbox (0 messages found)',
          tone: 'default',
        });
      }
    } catch (err: any) {
      if (err?.message === 'NEEDS_GOOGLE_AUTH') {
        setGmailPollStatus('needs_auth');
        try {
          const res = await googleSignIn();
          setAuthUser({
            uid: res.user.uid,
            email: res.user.email,
            name: res.user.displayName,
            photo: res.user.photoURL,
            hasToken: Boolean(res.accessToken),
          });
          if (res.accessToken) {
            const liveItems = await fetchGmailNotificationsLive(res.user.email);
            ingestGmailNotifications(liveItems, { forceToastNewest: true });
          }
        } catch {
          addToast({
            message: 'Sign in with Google to enable real-time Gmail polling',
            tone: 'warning',
          });
        }
      } else {
        setGmailPollStatus('error');
        addToast({
          message: 'Could not reach Gmail API. Check your Google connection.',
          tone: 'warning',
        });
      }
    } finally {
      setCheckingGmail(false);
    }
  };

  const handleCopyOtp = (item: GmailNotificationItem) => {
    if (!item.otpCode) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(item.otpCode);
    }
    setCopiedId(item.id);
    markNotificationRead(item.id);
    addToast({
      message: `Copied OTP ${item.otpCode} to clipboard`,
      tone: 'success',
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleConvertNotifToTask = async (item: GmailNotificationItem) => {
    markNotificationRead(item.id);
    await createTask(
      {
        title: item.subject,
        description: `From: ${item.from}\n${item.otpCode ? `OTP Code: ${item.otpCode}\n` : ''}\n${item.snippet}`,
        workspace: 'office',
        priority: item.category === 'otp' || item.category === 'urgent' ? 1 : 2,
        due_date: getTodayStr(),
        source: 'gmail',
        tags: item.otpCode ? ['gmail', 'otp'] : ['gmail'],
      },
      { openDetail: true }
    );
    addToast({
      message: `Created task from Gmail message`,
      tone: 'success',
    });
    setNotificationsOpen(false);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label="Gmail and OTP Notifications"
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: coords.width,
        zIndex: 115,
      }}
      className="popover-surface rounded-2xl p-3 space-y-2.5 max-h-[80dvh] flex flex-col"
    >
      <div className="flex items-center justify-between px-1.5 pb-2 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--text-1)]">
              Live Gmail Notifications
            </span>
            {hasGoogleToken && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#10B981]/15 text-[#10B981] text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                LIVE
              </span>
            )}
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-bold tnum">
                {unreadCount} unread
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--text-3)] tnum">
            {hasGoogleToken
              ? lastGmailPolledAt
                ? `Auto-polling every 15s · Last synced ${new Date(
                    lastGmailPolledAt
                  ).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}`
                : 'Auto-polling Gmail API every 15s'
              : userEmail
              ? `Signed in (${userEmail}) · Click below to authorize live Gmail stream`
              : 'Connect Google to poll live Gmail messages & OTPs'}
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllNotificationsRead}
            className="btn-ghost px-2 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 shrink-0"
          >
            <CheckCheck className="w-3 h-3" />
            <span>Mark read</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-1">
        <button
          type="button"
          onClick={() => void handleCheckGmailLive()}
          disabled={checkingGmail || gmailPollStatus === 'polling'}
          className="btn-accent w-full px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 min-h-[36px]"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              checkingGmail || gmailPollStatus === 'polling' ? 'animate-spin' : ''
            }`}
          />
          <span>
            {checkingGmail || gmailPollStatus === 'polling'
              ? 'Polling Gmail API...'
              : hasGoogleToken
              ? 'Poll Live Gmail Inbox Now'
              : 'Connect & Poll Live Gmail Inbox'}
          </span>
        </button>
      </div>

      <div className="space-y-2 overflow-y-auto pr-0.5 max-h-[340px]">
        {notifications.length === 0 ? (
          <div className="py-6 px-3 text-center space-y-2">
            <div className="text-xs font-medium text-[var(--text-2)]">
              {hasGoogleToken
                ? 'Listening for incoming Gmail messages...'
                : 'No live Gmail messages synced yet'}
            </div>
            <p className="text-[11px] text-[var(--text-3)] leading-relaxed">
              {hasGoogleToken
                ? 'Cadence polls your real Gmail inbox every 15 seconds and displays non-intrusive toasts as new emails or OTP codes arrive.'
                : 'Click "Connect & Poll Live Gmail Inbox" above to authorize Gmail access and receive real-time toast notifications.'}
            </p>
          </div>
        ) : (
          notifications.map((item) => (
            <div
              key={item.id}
              onClick={() => markNotificationRead(item.id)}
              className={`p-2.5 rounded-xl border transition space-y-1.5 ${
                item.read
                  ? 'bg-[var(--surface-1)] border-[var(--border)] opacity-80'
                  : 'bg-[var(--surface-2)] border-[var(--border-strong)]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {item.category === 'otp' ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
                      <KeyRound className="w-2.5 h-2.5" />
                      OTP CODE
                    </span>
                  ) : item.category === 'urgent' ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#F43F5E]/15 text-[#F43F5E] border border-[#F43F5E]/30">
                      URGENT
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--surface-3)] text-[var(--text-3)]">
                      GMAIL
                    </span>
                  )}
                  <span className="text-[10px] text-[var(--text-3)] tnum">{item.date}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissNotification(item.id);
                  }}
                  aria-label={`Dismiss notification ${item.subject}`}
                  className="text-[var(--text-4)] hover:text-[var(--text-1)] p-0.5 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-xs font-semibold text-[var(--text-1)] leading-snug">
                {item.subject}
              </div>
              <div className="text-[11px] text-[var(--text-3)] truncate">{item.from}</div>
              <p className="text-[11px] text-[var(--text-2)] line-clamp-2">{item.snippet}</p>

              <div className="flex items-center justify-between gap-2 pt-1">
                {item.otpCode ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyOtp(item);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] border border-[#10B981]/30 text-xs font-mono font-bold tnum transition"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied {item.otpCode}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy OTP: {item.otpCode}</span>
                      </>
                    )}
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleConvertNotifToTask(item);
                  }}
                  className="btn-ghost px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>To Task</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body
  );
}

/**
 * Settings & Google Ecosystem Popover (clamped inside viewport even at 320px)
 */
function SettingsPopover({
  triggerRef,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const settingsOpen = useCadenceStore((s) => s.settingsOpen);
  const setSettingsOpen = useCadenceStore((s) => s.setSettingsOpen);
  const setActiveModal = useCadenceStore((s) => s.setActiveModal);
  const tasks = useCadenceStore((s) => s.tasks);
  const events = useCadenceStore((s) => s.events);
  const workspace = useCadenceStore((s) => s.workspace);
  const importTasksBatch = useCadenceStore((s) => s.importTasksBatch);
  const syncTasksWithGoogleSheets = useCadenceStore((s) => s.syncTasksWithGoogleSheets);
  const autoSyncSheets = useCadenceStore((s) => s.autoSyncSheets);
  const setAutoSyncSheets = useCadenceStore((s) => s.setAutoSyncSheets);
  const mergeExternalEvents = useCadenceStore((s) => s.mergeExternalEvents);
  const addToast = useCadenceStore((s) => s.addToast);
  const userEmail = useCadenceStore((s) => s.userEmail);
  const userName = useCadenceStore((s) => s.userName);
  const setAuthUser = useCadenceStore((s) => s.setAuthUser);

  const popRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [coords, setCoords] = useState({ top: 60, left: 16, width: 316 });
  const [syncingCal, setSyncingCal] = useState(false);
  const [syncingTasks, setSyncingTasks] = useState(false);
  const [syncingSheet, setSyncingSheet] = useState(false);

  const updatePos = () => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(324, vw - 16);
    const left = Math.max(8, Math.min(rect.right - width, vw - width - 8));
    const top = Math.min(rect.bottom + 8, window.innerHeight - 480);
    setCoords({ top: Math.max(8, top), left, width });
  };

  useLayoutEffect(() => {
    if (!settingsOpen) return;
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setSettingsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen, setSettingsOpen]);

  if (!settingsOpen || typeof document === 'undefined') return null;

  const handleFileImportGoogleTasksV1 = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const maxOrder = tasks.reduce(
        (m, t) => (t.sort_order > m ? t.sort_order : m),
        0
      );
      const defaultWs = workspace === 'personal' ? 'personal' : 'office';
      const parsedTasks = parseGoogleTasksV1Json(text, {
        defaultWorkspace: defaultWs,
        baseSortOrder: maxOrder,
      });

      if (parsedTasks.length === 0) {
        addToast({
          message: `No valid Google Tasks v1 items found in "${file.name}"`,
          tone: 'warning',
        });
        return;
      }

      await importTasksBatch(parsedTasks);
      addToast({
        message: `Imported ${parsedTasks.length} task${
          parsedTasks.length > 1 ? 's' : ''
        } from "${file.name}" & synced to Google Sheets`,
        tone: 'success',
      });
      setSettingsOpen(false);
    } catch {
      addToast({
        message: `Failed to parse "${file.name}". Expected Google Tasks v1 JSON format.`,
        tone: 'danger',
      });
    }
  };

  const handlePullLiveGoogleTasks = async () => {
    setSyncingTasks(true);
    try {
      const maxOrder = tasks.reduce(
        (m, t) => (t.sort_order > m ? t.sort_order : m),
        0
      );
      const pulled = await fetchGoogleTasksLive('@default', maxOrder);
      if (pulled.length > 0) {
        await importTasksBatch(pulled);
        addToast({
          message: `Synced ${pulled.length} tasks from Google Tasks API`,
          tone: 'success',
        });
      } else {
        addToast({
          message: 'Connected to Google Tasks API (0 tasks in @default list)',
          tone: 'default',
        });
      }
      setSettingsOpen(false);
    } catch (err: any) {
      if (err?.message === 'NEEDS_GOOGLE_AUTH') {
        setSettingsOpen(false);
        setActiveModal('tasks_io');
      } else {
        addToast({
          message: 'Opened Google Tasks & Sheets Hub',
          tone: 'default',
        });
        setSettingsOpen(false);
        setActiveModal('tasks_io');
      }
    } finally {
      setSyncingTasks(false);
    }
  };

  const handleQuickSheetSync = async () => {
    setSyncingSheet(true);
    try {
      const count = await syncTasksWithGoogleSheets();
      addToast({
        message: `Synced all ${count} tasks with Google Sheets`,
        tone: 'success',
      });
      setSettingsOpen(false);
    } finally {
      setSyncingSheet(false);
    }
  };

  const handleSyncCalendar = async () => {
    setSyncingCal(true);
    try {
      const liveEvents = await fetchGoogleCalendarLiveEvents();
      mergeExternalEvents(liveEvents);
      addToast({
        message: `Synced ${liveEvents.length} Google Calendar events`,
        tone: 'success',
      });
    } catch (err: any) {
      if (err?.message === 'NEEDS_GOOGLE_AUTH') {
        try {
          const res = await googleSignIn();
          setAuthUser({
            uid: res.user.uid,
            email: res.user.email,
            name: res.user.displayName,
            photo: res.user.photoURL,
            hasToken: Boolean(res.accessToken),
          });
          const liveEvents = await fetchGoogleCalendarLiveEvents();
          mergeExternalEvents(liveEvents);
          addToast({
            message: `Synced ${liveEvents.length} Google Calendar events`,
            tone: 'success',
          });
        } catch {
          addToast({
            message: 'Sign in with Google to sync your live primary calendar',
            tone: 'warning',
          });
        }
      } else {
        addToast({
          message: 'Verified local Google Calendar events',
          tone: 'success',
        });
      }
    } finally {
      setSyncingCal(false);
      setSettingsOpen(false);
    }
  };

  const handleBackupJson = () => {
    const payload = {
      app: 'Cadence Focus OS',
      exportedAt: new Date().toISOString(),
      tasks,
      events,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence-backup-${getTodayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ message: 'Downloaded full JSON backup', tone: 'success' });
    setSettingsOpen(false);
  };

  return createPortal(
    <div
      ref={popRef}
      role="dialog"
      aria-label="Google Ecosystem and Settings"
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: coords.width,
        zIndex: 115,
      }}
      className="popover-surface rounded-2xl p-3 space-y-2.5"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        aria-label="Upload Google Tasks v1 JSON file"
        onChange={(e) => void handleFileImportGoogleTasksV1(e)}
        className="hidden"
      />

      <div className="px-2 py-1 border-b border-[var(--border)]">
        <div className="text-xs font-semibold text-[var(--text-1)]">
          Google Workspace & Settings
        </div>
        <div className="text-[11px] text-[var(--text-3)] truncate">
          {userEmail
            ? `Connected: ${userName || userEmail}`
            : 'Sync Tasks, Sheets, Calendar, Gmail & Drive'}
        </div>
      </div>

      {!userEmail ? (
        <div className="px-1">
          <GoogleSignInButton onSuccess={() => setSettingsOpen(false)} />
        </div>
      ) : (
        <div className="flex items-center justify-between px-2 py-1.5 rounded-xl bg-[var(--surface-1)] text-xs">
          <span className="truncate font-medium text-[var(--text-2)]">{userEmail}</span>
          <button
            type="button"
            onClick={async () => {
              await logout();
              setAuthUser({ uid: null, email: null, name: null, photo: null, hasToken: false });
              addToast({ message: 'Signed out of Google account' });
              setSettingsOpen(false);
            }}
            className="inline-flex items-center gap-1 text-[var(--text-3)] hover:text-[var(--text-1)] shrink-0 ml-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      )}

      <div className="space-y-1">
        {/* Direct Google Tasks v1 JSON File Import in Settings Popover */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold text-[var(--text-1)] bg-[var(--accent-soft)] hover:opacity-95 border border-[var(--border-strong)] transition"
        >
          <span className="inline-flex items-center gap-2.5">
            <Upload className="w-4 h-4 text-[var(--accent)]" />
            <span>Import Google Tasks JSON (.json)</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--accent)]">
            v1 File
          </span>
        </button>

        {/* Google Tasks API Live Sync + Hub */}
        <button
          type="button"
          onClick={() => void handlePullLiveGoogleTasks()}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] transition"
        >
          <span className="inline-flex items-center gap-2.5">
            <FileJson className={`w-4 h-4 text-[#10B981] ${syncingTasks ? 'animate-spin' : ''}`} />
            <span>Google Tasks & Sheets Hub</span>
          </span>
          <span className="text-[11px] text-[var(--text-3)]">CRUD + Sync</span>
        </button>

        {/* 1-Click Sync All Tasks with Google Sheets */}
        <button
          type="button"
          onClick={() => void handleQuickSheetSync()}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] transition"
        >
          <span className="inline-flex items-center gap-2.5">
            <FileSpreadsheet className={`w-4 h-4 text-[#059669] ${syncingSheet ? 'animate-spin' : ''}`} />
            <span>Sync All Tasks → Google Sheet</span>
          </span>
          <span className="text-[11px] text-[#10B981] font-semibold tnum">
            {tasks.length} rows
          </span>
        </button>

        {/* Auto-sync toggle */}
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-[var(--surface-1)] text-xs">
          <span className="text-[11px] text-[var(--text-2)] font-medium">
            Auto-sync CRUD with Google Sheet
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoSyncSheets}
            aria-label="Toggle automatic Google Sheets sync"
            onClick={() => {
              const next = !autoSyncSheets;
              setAutoSyncSheets(next);
              if (next) void syncTasksWithGoogleSheets();
            }}
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${
              autoSyncSheets
                ? 'bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30'
                : 'bg-[var(--surface-3)] text-[var(--text-3)]'
            }`}
          >
            {autoSyncSheets ? 'ON' : 'OFF'}
          </button>
        </div>

        <button
          type="button"
          onClick={handleSyncCalendar}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] transition"
        >
          <span className="inline-flex items-center gap-2.5">
            <RefreshCw className={`w-4 h-4 text-[var(--accent)] ${syncingCal ? 'animate-spin' : ''}`} />
            <span>Google Calendar Sync</span>
          </span>
          <span className="text-[11px] text-[var(--text-3)]">Live</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSettingsOpen(false);
            setActiveModal('gmail');
          }}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] transition"
        >
          <span className="inline-flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-[#EA4335]" />
            <span>Gmail → Task & OTP Capture</span>
          </span>
          <span className="text-[11px] text-[var(--text-3)]">Inbox</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSettingsOpen(false);
            setActiveModal('drive');
          }}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] transition"
        >
          <span className="inline-flex items-center gap-2.5">
            <FolderOpen className="w-4 h-4 text-[#3B82F6]" />
            <span>Google Drive Attachments</span>
          </span>
          <span className="text-[11px] text-[var(--text-3)]">Picker</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSettingsOpen(false);
            setActiveModal('shortcuts');
          }}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] transition"
        >
          <span className="inline-flex items-center gap-2.5">
            <Keyboard className="w-4 h-4 text-[var(--text-3)]" />
            <span>Keyboard Shortcuts</span>
          </span>
          <span className="kbd">?</span>
        </button>

        <button
          type="button"
          onClick={handleBackupJson}
          className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-3)] hover:text-[var(--text-1)] transition"
        >
          <span className="inline-flex items-center gap-2.5">
            <Download className="w-4 h-4 text-[var(--text-3)]" />
            <span>Backup All Data (JSON)</span>
          </span>
        </button>
      </div>
    </div>,
    document.body
  );
}

/**
 * Shell Layout:
 * - Desktop (>=1024px): permanent 72px left icon rail + floating overlay nav panel (fixed, left 80px, width 264px, transform+opacity only, NO desktop scrim)
 * - Mobile (<1024px): drawer with scrim + bottom tab bar (all 6 views) + floating create FAB
 * - Topbar (56px): mobile menu button, view icon + name + workspace badge + date, ⌘K button, progress ring, grouped notifications+theme+settings, primary "New task"
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const tasks = useCadenceStore((s) => s.tasks);
  const workspace = useCadenceStore((s) => s.workspace);
  const setWorkspace = useCadenceStore((s) => s.setWorkspace);
  const activeView = useCadenceStore((s) => s.activeView);
  const setActiveView = useCadenceStore((s) => s.setActiveView);
  const navOpen = useCadenceStore((s) => s.navOpen);
  const setNavOpen = useCadenceStore((s) => s.setNavOpen);
  const toggleNav = useCadenceStore((s) => s.toggleNav);
  const theme = useCadenceStore((s) => s.theme);
  const toggleTheme = useCadenceStore((s) => s.toggleTheme);
  const settingsOpen = useCadenceStore((s) => s.settingsOpen);
  const setSettingsOpen = useCadenceStore((s) => s.setSettingsOpen);
  const notificationsOpen = useCadenceStore((s) => s.notificationsOpen);
  const setNotificationsOpen = useCadenceStore((s) => s.setNotificationsOpen);
  const notifications = useCadenceStore((s) => s.notifications);
  const ingestGmailNotifications = useCadenceStore((s) => s.ingestGmailNotifications);
  const hasGoogleToken = useCadenceStore((s) => s.hasGoogleToken);
  const setCommandPaletteOpen = useCadenceStore((s) => s.setCommandPaletteOpen);
  const openComposer = useCadenceStore((s) => s.openComposer);
  const userName = useCadenceStore((s) => s.userName);
  const userEmail = useCadenceStore((s) => s.userEmail);

  const setGmailPollStatus = useCadenceStore((s) => s.setGmailPollStatus);
  const setAuthUser = useCadenceStore((s) => s.setAuthUser);

  const settingsBtnRef = useRef<HTMLButtonElement | null>(null);
  const notifBtnRef = useRef<HTMLButtonElement | null>(null);

  // Hydrate cached real Gmail notifications for the signed-in user from backend on mount
  useEffect(() => {
    if (!userEmail) return;
    fetch(`/api/gmail/notifications?email=${encodeURIComponent(userEmail)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.messages) && data.messages.length > 0) {
          ingestGmailNotifications(data.messages);
        }
      })
      .catch(() => {});
  }, [userEmail, ingestGmailNotifications]);

  // Real-time Gmail polling loop every 15s + on window focus/visibility when signed in with Google OAuth token
  useEffect(() => {
    if (!hasGoogleToken) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      setGmailPollStatus('polling');
      try {
        const items = await fetchGmailNotificationsLive(userEmail);
        if (!cancelled) {
          ingestGmailNotifications(items);
        }
      } catch (err: any) {
        if (!cancelled) {
          if (err?.message === 'NEEDS_GOOGLE_AUTH') {
            setGmailPollStatus('needs_auth');
            const st = useCadenceStore.getState();
            setAuthUser({
              uid: st.userUid,
              email: st.userEmail,
              name: st.userName,
              photo: st.userPhoto,
              hasToken: false,
            });
          } else {
            setGmailPollStatus('error');
          }
        }
      }
    };

    void poll();
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void poll();
      }
    }, 15000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void poll();
      }
    };
    window.addEventListener('focus', onVisibility);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener('focus', onVisibility);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hasGoogleToken, userEmail, ingestGmailNotifications, setGmailPollStatus, setAuthUser]);

  const unreadNotifCount = notifications.filter((n) => !n.read).length;
  const hasUnreadOtp = notifications.some((n) => !n.read && n.category === 'otp');

  const scopedTasks = tasks.filter(
    (t) => workspace === 'all' || t.workspace === workspace
  );
  const openTaskCount = scopedTasks.filter((t) => t.status !== 'done').length;
  const todayStats = computeTodayProgress(scopedTasks, getTodayStr());

  const currentViewMeta =
    VIEW_CONFIG.find((v) => v.id === activeView) || VIEW_CONFIG[0];
  const CurrentViewIcon = currentViewMeta.icon;

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const selectViewFromNav = (v: ViewId) => {
    setActiveView(v);
    if (window.innerWidth < 1024) {
      setNavOpen(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col lg:pl-[72px] relative z-10">
      {/* DESKTOP 72px ICON RAIL (>=1024px) */}
      <aside
        aria-label="Primary rail"
        className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[72px] z-40 flex-col items-center justify-between py-3 bg-[var(--surface-2)] border-r border-[var(--border)]"
      >
        <div className="flex flex-col items-center gap-3">
          {/* Logo button */}
          <button
            type="button"
            onClick={toggleNav}
            title="Cadence Navigation (B)"
            aria-label="Toggle navigation panel"
            className="w-10 h-10 rounded-2xl btn-accent flex items-center justify-center font-display font-bold text-base shadow-sm"
          >
            C
          </button>

          {/* Expand/collapse chevron */}
          <button
            type="button"
            onClick={toggleNav}
            title={navOpen ? 'Collapse navigation (B)' : 'Expand navigation (B)'}
            aria-label={navOpen ? 'Collapse navigation' : 'Expand navigation'}
            aria-expanded={navOpen}
            className="btn-ghost w-10 h-10 rounded-xl flex items-center justify-center"
          >
            {navOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {/* View icons */}
          <nav aria-label="Views" className="flex flex-col items-center gap-1.5 pt-1">
            {VIEW_CONFIG.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  title={`${item.label} (${item.shortcut})`}
                  aria-label={item.label}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                    isActive
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--border-strong)]'
                      : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col items-center gap-2.5">
          {/* Open task count */}
          <div
            title={`${openTaskCount} open tasks`}
            className="px-2 py-1 rounded-lg bg-[var(--surface-1)] border border-[var(--border)] text-[11px] font-semibold text-[var(--text-2)] tnum"
          >
            {openTaskCount}
          </div>

          {/* Quick-add button */}
          <button
            type="button"
            onClick={() => openComposer()}
            title="New task (N)"
            aria-label="Quick add task"
            className="w-10 h-10 rounded-xl btn-accent flex items-center justify-center"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Avatar button */}
          <button
            type="button"
            onClick={() => setSettingsOpen(!settingsOpen)}
            title={userName || userEmail || 'Account & Google Sync'}
            aria-label="Account & Google Workspace settings"
            className="w-9 h-9 rounded-full bg-[var(--surface-3)] border border-[var(--border-strong)] flex items-center justify-center text-xs font-bold text-[var(--text-1)] uppercase"
          >
            {(userName || userEmail || 'CA').slice(0, 2)}
          </button>
        </div>
      </aside>

      {/* FLOATING OVERLAY NAVIGATION PANEL */}
      <AnimatePresence>
        {navOpen && (
          <>
            {/* Scrim on mobile ONLY (<1024px). Desktop has NO blocking scrim so task area stays interactive */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setNavOpen(false)}
              className="lg:hidden fixed inset-0 z-50"
              style={{ backgroundColor: 'var(--overlay)' }}
            />

            <motion.aside
              aria-label="Workspace navigation panel"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="popover-surface fixed z-55 top-0 lg:top-[64px] left-0 lg:left-[80px] bottom-0 lg:bottom-auto lg:max-h-[calc(100dvh-80px)] w-[264px] max-w-[calc(100vw-16px)] lg:rounded-2xl p-3.5 flex flex-col justify-between overflow-y-auto"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg btn-accent flex items-center justify-center font-display font-bold text-xs">
                      C
                    </div>
                    <div>
                      <div className="font-display text-sm font-bold text-[var(--text-1)] leading-none">
                        Cadence
                      </div>
                      <div className="text-[11px] text-[var(--text-3)]">Focus OS</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNavOpen(false)}
                    aria-label="Close navigation panel"
                    className="btn-ghost p-1.5 rounded-lg text-xs"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>

                {/* Workspace switcher */}
                <div className="space-y-1">
                  <div className="px-2 text-[11px] font-semibold text-[var(--text-3)]">
                    Workspace Mode
                  </div>
                  {(
                    [
                      { id: 'all', label: 'Unified All', icon: Layers, desc: 'Office + Personal' },
                      { id: 'office', label: 'Office Mode', icon: Briefcase, desc: 'Sprints & meetings' },
                      { id: 'personal', label: 'Personal Mode', icon: Heart, desc: 'Habits & life' },
                    ] as const
                  ).map((ws) => {
                    const Icon = ws.icon;
                    const active = workspace === ws.id;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => setWorkspace(ws.id as WorkspaceFilter)}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition ${
                          active
                            ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold border border-[var(--border-strong)]'
                            : 'text-[var(--text-2)] hover:bg-[var(--surface-3)]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{ws.label}</span>
                        </span>
                        <span className="text-[10px] text-[var(--text-3)]">{ws.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {/* All 6 Views */}
                <div className="space-y-1">
                  <div className="px-2 text-[11px] font-semibold text-[var(--text-3)]">
                    Views
                  </div>
                  {VIEW_CONFIG.map((v) => {
                    const Icon = v.icon;
                    const active = activeView === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => selectViewFromNav(v.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs transition ${
                          active
                            ? 'bg-[var(--surface-3)] text-[var(--text-1)] font-semibold'
                            : 'text-[var(--text-2)] hover:bg-[var(--surface-1)]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <Icon className="w-4 h-4 text-[var(--accent)]" />
                          <span>{v.label}</span>
                        </span>
                        <span className="kbd">{v.shortcut}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-[var(--border)] space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    openComposer();
                    if (window.innerWidth < 1024) setNavOpen(false);
                  }}
                  className="btn-accent w-full py-2.5 px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 min-h-[40px]"
                >
                  <Plus className="w-4 h-4" />
                  <span>New task</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* TOPBAR (56px) */}
      <header
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
        className="sticky top-0 z-30 h-14 px-2 sm:px-5 glass border-b border-[var(--border)] flex items-center justify-between gap-1.5 sm:gap-2"
      >
        {/* Left: mobile menu button (hidden >=lg) + view icon + name + workspace badge + date */}
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 shrink">
          <button
            type="button"
            onClick={toggleNav}
            aria-label="Open navigation menu"
            className="lg:hidden btn-ghost w-9 h-9 sm:w-10 sm:h-10 rounded-xl inline-flex items-center justify-center shrink-0"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] hidden sm:flex items-center justify-center shrink-0">
              <CurrentViewIcon className="w-4 h-4" />
            </div>
            <h1 className="font-display text-sm sm:text-base font-bold text-[var(--text-1)] whitespace-nowrap">
              {currentViewMeta.label}
            </h1>
            <button
              type="button"
              onClick={() => useCadenceStore.getState().cycleWorkspace()}
              title="Cycle workspace (W)"
              className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--surface-3)] text-[var(--text-2)] hover:text-[var(--text-1)] capitalize shrink-0"
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor:
                    workspace === 'office'
                      ? '#4F46E5'
                      : workspace === 'personal'
                      ? '#059669'
                      : '#06B6D4',
                }}
              />
              <span>{workspace}</span>
            </button>
            <span className="hidden xl:inline text-xs text-[var(--text-3)] whitespace-nowrap pl-1">
              · {todayFormatted}
            </span>
          </div>
        </div>

        {/* Center: Capture / Search button (Ctrl+K) */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          aria-label="Open command palette and search"
          className="btn-ghost px-2 sm:px-3.5 py-1.5 rounded-xl text-xs text-[var(--text-3)] inline-flex items-center justify-between gap-2 sm:gap-3 sm:max-w-[260px] sm:flex-1 min-h-[36px] sm:min-h-[38px] shrink-0"
        >
          <span className="inline-flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline truncate">Search or run command...</span>
          </span>
          <span className="kbd hidden sm:inline-flex items-center gap-0.5">
            <Command className="w-2.5 h-2.5" />
            <span>K</span>
          </span>
        </button>

        {/* Right: Focus timer pill + today progress ring + grouped notifications/theme/settings + primary "New task" */}
        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
          <FocusTimerBanner />

          {/* Today progress ring (uses exact shared formula) */}
          <button
            type="button"
            onClick={() => setActiveView('my_day')}
            title={`Today's progress: ${todayStats.completedTodayCount}/${todayStats.totalCount} (${todayStats.percentage}%)`}
            aria-label={`Today's progress ${todayStats.percentage}%`}
            className="hidden xs:inline-flex sm:inline-flex items-center gap-1.5 px-1.5 py-1 rounded-xl hover:bg-[var(--surface-3)] transition"
          >
            <ProgressRing percentage={todayStats.percentage} size={26} strokeWidth={3} />
            <span className="hidden md:inline text-xs font-semibold text-[var(--text-2)] tnum">
              {todayStats.completedTodayCount}/{todayStats.totalCount}
            </span>
          </button>

          {/* Notifications + Theme toggle + settings icon grouped in ONE segmented container */}
          <div className="inline-flex items-center p-0.5 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] shrink-0">
            <button
              ref={notifBtnRef}
              type="button"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              aria-label="Open Gmail and OTP notifications"
              aria-expanded={notificationsOpen}
              title="Gmail & OTP Notifications"
              className="relative p-1.5 sm:p-2 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] min-w-[34px] min-h-[34px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center transition"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifCount > 0 && (
                <span
                  className={`absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center tnum ${
                    hasUnreadOtp ? 'bg-[#10B981]' : 'bg-[#F43F5E]'
                  }`}
                >
                  {unreadNotifCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title="Toggle theme (D)"
              className="p-1.5 sm:p-2 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] min-w-[34px] min-h-[34px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center transition"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              ref={settingsBtnRef}
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              aria-label="Open Google Workspace and settings menu"
              aria-expanded={settingsOpen}
              title="Google Workspace & Settings"
              className="p-1.5 sm:p-2 rounded-lg text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] min-w-[34px] min-h-[34px] sm:min-w-[36px] sm:min-h-[36px] inline-flex items-center justify-center transition"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Primary New task CTA */}
          <button
            type="button"
            onClick={() => openComposer()}
            aria-label="New task"
            className="btn-accent px-2.5 sm:px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 min-h-[36px] sm:min-h-[38px] whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New task</span>
          </button>
        </div>
      </header>

      {/* Mobile focus timer row so it never crushes the phone header */}
      <FocusTimerBanner mobileRow />

      <NotificationsPopover triggerRef={notifBtnRef} />
      <SettingsPopover triggerRef={settingsBtnRef} />

      {/* MAIN VIEWPORT CONTENT */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-3 sm:px-6 pt-4 pb-24 lg:pb-10 min-w-0">
        {children}
      </main>

      {/* MOBILE FLOATING CREATE FAB & BOTTOM TAB BAR (<=1023px) */}
      <button
        type="button"
        onClick={() => openComposer()}
        aria-label="Create task"
        className="lg:hidden fixed right-4 bottom-20 z-30 w-12 h-12 rounded-2xl btn-accent flex items-center justify-center shadow-lg"
      >
        <Plus className="w-5 h-5" />
      </button>

      <nav
        aria-label="Mobile view navigation"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 glass border-t border-[var(--border)] flex items-center overflow-x-auto no-scrollbar px-1.5 py-1"
      >
        {VIEW_CONFIG.map((v) => {
          const Icon = v.icon;
          const active = activeView === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setActiveView(v.id)}
              className={`flex-1 min-w-[52px] min-h-[44px] py-1 px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium whitespace-nowrap shrink-0 transition ${
                active
                  ? 'text-[var(--accent)] font-semibold bg-[var(--accent-soft)]'
                  : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{v.shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
