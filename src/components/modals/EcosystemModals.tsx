import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckSquare,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  KeyRound,
  Mail,
  MapPin,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { isSafeExternalUrl, type Attachment, type Task } from '../../db/schema';
import { formatHumanDate, formatTime12h, getTodayStr } from '../../lib/dateUtils';
import {
  createGoogleTaskLive,
  deleteGoogleTaskLive,
  fetchGmailNotificationsLive,
  fetchGoogleDriveRecentFiles,
  fetchGoogleTasksLive,
  googleSignIn,
  pullTasksFromGoogleSheet,
} from '../../lib/firebase';
import {
  extractOtpFromText,
  parseGoogleTasksV1Json,
  parseTaskInput,
  tasksToCsv,
  tasksToTsv,
  type GmailNotificationItem,
} from '../../lib/nlpParser';
import { useCadenceStore } from '../../store/useCadenceStore';
import { GoogleSignInButton, VIEW_CONFIG } from '../shell/Shell';
import { Modal, PriorityBadge } from '../ui/Primitives';

export function CommandPaletteModal() {
  const open = useCadenceStore((s) => s.commandPaletteOpen);
  const setOpen = useCadenceStore((s) => s.setCommandPaletteOpen);
  const tasks = useCadenceStore((s) => s.tasks);
  const setActiveView = useCadenceStore((s) => s.setActiveView);
  const setWorkspace = useCadenceStore((s) => s.setWorkspace);
  const toggleTheme = useCadenceStore((s) => s.toggleTheme);
  const openComposer = useCadenceStore((s) => s.openComposer);
  const createTask = useCadenceStore((s) => s.createTask);
  const setSelectedTaskId = useCadenceStore((s) => s.setSelectedTaskId);
  const setActiveModal = useCadenceStore((s) => s.setActiveModal);
  const planMyDay = useCadenceStore((s) => s.planMyDay);
  const syncTasksWithGoogleSheets = useCadenceStore((s) => s.syncTasksWithGoogleSheets);

  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const commands = useMemo(
    () => [
      {
        id: 'cmd_new_task',
        label: 'Create a new task',
        shortcut: 'N',
        action: () => {
          setOpen(false);
          openComposer({ initialTitle: query });
        },
      },
      {
        id: 'cmd_plan_day',
        label: 'Plan my day (Auto-schedule free 9:00–18:00 slots)',
        shortcut: 'Auto',
        action: () => {
          setOpen(false);
          setActiveView('my_day');
          planMyDay();
        },
      },
      ...VIEW_CONFIG.map((v) => ({
        id: `cmd_view_${v.id}`,
        label: `Go to ${v.label}`,
        shortcut: v.shortcut,
        action: () => {
          setActiveView(v.id);
          setOpen(false);
        },
      })),
      {
        id: 'cmd_ws_all',
        label: 'Switch Workspace: Unified All',
        shortcut: 'W',
        action: () => {
          setWorkspace('all');
          setOpen(false);
        },
      },
      {
        id: 'cmd_ws_office',
        label: 'Switch Workspace: Office Mode',
        shortcut: 'W',
        action: () => {
          setWorkspace('office');
          setOpen(false);
        },
      },
      {
        id: 'cmd_ws_personal',
        label: 'Switch Workspace: Personal Mode',
        shortcut: 'W',
        action: () => {
          setWorkspace('personal');
          setOpen(false);
        },
      },
      {
        id: 'cmd_theme',
        label: 'Toggle Dark / Light Theme',
        shortcut: 'D',
        action: () => {
          toggleTheme();
          setOpen(false);
        },
      },
      {
        id: 'cmd_gmail',
        label: 'Google Integration: Gmail & OTP Inbox Capture',
        shortcut: 'Gmail',
        action: () => {
          setOpen(false);
          setActiveModal('gmail');
        },
      },
      {
        id: 'cmd_drive',
        label: 'Google Integration: Attach from Google Drive',
        shortcut: 'Drive',
        action: () => {
          setOpen(false);
          setActiveModal('drive');
        },
      },
      {
        id: 'cmd_gtasks',
        label: 'Google Integration: Google Tasks JSON & Google Sheets Sync Hub',
        shortcut: 'Sync',
        action: () => {
          setOpen(false);
          setActiveModal('tasks_io');
        },
      },
      {
        id: 'cmd_sheets_sync',
        label: 'Sync All Tasks with Google Sheet Now',
        shortcut: 'Sheet',
        action: () => {
          setOpen(false);
          void syncTasksWithGoogleSheets(true);
        },
      },
    ],
    [
      query,
      openComposer,
      setOpen,
      setActiveView,
      planMyDay,
      setWorkspace,
      toggleTheme,
      setActiveModal,
      syncTasksWithGoogleSheets,
    ]
  );

  const q = query.trim().toLowerCase();
  const matchedTasks = useMemo(
    () =>
      q
        ? tasks.filter((t) =>
            `${t.title} ${t.tags.join(' ')}`.toLowerCase().includes(q)
          )
        : tasks.slice(0, 4),
    [tasks, q]
  );

  const matchedCommands = useMemo(
    () =>
      q
        ? commands.filter((c) => c.label.toLowerCase().includes(q))
        : commands,
    [commands, q]
  );

  const handleQuickCreateNLP = async () => {
    if (!query.trim()) return;
    const parsed = parseTaskInput(query, getTodayStr());
    await createTask({
      title: parsed.cleanTitle || query.trim(),
      workspace: parsed.workspace,
      priority: parsed.priority,
      due_date: parsed.due_date ?? getTodayStr(),
      due_time: parsed.due_time ?? null,
      recurrence: parsed.recurrence ?? null,
      estimated_minutes: parsed.estimated_minutes ?? null,
      tags: parsed.tags,
      source: 'quick-add',
    });
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Command Palette"
      subtitle="Search tasks, switch views, or type natural language to quick-add"
      maxWidth="max-w-xl"
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--text-3)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) {
                e.preventDefault();
                void handleQuickCreateNLP();
              }
            }}
            placeholder="Type a command, search tasks, or 'Call Alex tomorrow at 3pm #office'..."
            className="input-base w-full pl-10 pr-4 py-2.5 rounded-xl text-xs font-medium"
          />
        </div>

        {query.trim() && (
          <button
            type="button"
            onClick={() => void handleQuickCreateNLP()}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold"
          >
            <span className="inline-flex items-center gap-2 truncate">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="truncate">Quick-create from NLP: "{query}"</span>
            </span>
            <span className="kbd">↵</span>
          </button>
        )}

        {matchedTasks.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold text-[var(--text-3)] px-1">
              Tasks
            </div>
            {matchedTasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  setSelectedTaskId(t.id);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-[var(--surface-3)] text-xs text-left transition"
              >
                <span className="truncate font-medium text-[var(--text-1)]">
                  {t.title}
                </span>
                <PriorityBadge priority={t.priority} short />
              </button>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-3)] px-1">
            Commands
          </div>
          {matchedCommands.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              onClick={cmd.action}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl hover:bg-[var(--surface-3)] text-xs text-[var(--text-2)] hover:text-[var(--text-1)] transition"
            >
              <span>{cmd.label}</span>
              <span className="kbd">{cmd.shortcut}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function CalendarEventDetailModal() {
  const ev = useCadenceStore((s) => s.selectedEvent);
  const setSelectedEvent = useCadenceStore((s) => s.setSelectedEvent);

  return (
    <Modal
      open={Boolean(ev)}
      onClose={() => setSelectedEvent(null)}
      title={ev?.title || 'Calendar Event'}
      subtitle="Synced from Google Calendar"
      maxWidth="max-w-md"
    >
      {ev && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] space-y-2.5 text-xs">
            <div className="flex items-center gap-2.5 text-[var(--text-1)] font-medium">
              <Calendar className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>{formatHumanDate(ev.date)} ({ev.date})</span>
            </div>
            <div className="flex items-center gap-2.5 text-[var(--text-2)] tnum">
              <Clock className="w-4 h-4 text-[var(--text-3)] shrink-0" />
              <span>
                {formatTime12h(ev.start_time)} – {formatTime12h(ev.end_time)}
              </span>
            </div>
            {ev.location && (
              <div className="flex items-center gap-2.5 text-[var(--text-2)]">
                <MapPin className="w-4 h-4 text-[var(--text-3)] shrink-0" />
                <span>{ev.location}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {isSafeExternalUrl(ev.meet_link) ? (
              <a
                href={ev.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-accent px-4 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 min-h-[40px]"
              >
                <Video className="w-4 h-4" />
                <span>Join Google Meet</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <span className="text-xs text-[var(--text-3)]">No video conferencing link</span>
            )}
            <button
              type="button"
              onClick={() => setSelectedEvent(null)}
              className="btn-ghost px-4 py-2 rounded-xl text-xs font-medium min-h-[40px]"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function EcosystemModals() {
  const activeModal = useCadenceStore((s) => s.activeModal);
  const setActiveModal = useCadenceStore((s) => s.setActiveModal);
  const createTask = useCadenceStore((s) => s.createTask);
  const tasks = useCadenceStore((s) => s.tasks);
  const selectedTaskId = useCadenceStore((s) => s.selectedTaskId);
  const patchTask = useCadenceStore((s) => s.patchTask);
  const importTasksBatch = useCadenceStore((s) => s.importTasksBatch);
  const addToast = useCadenceStore((s) => s.addToast);
  const hasGoogleToken = useCadenceStore((s) => s.hasGoogleToken);
  const workspace = useCadenceStore((s) => s.workspace);

  const linkedSpreadsheetId = useCadenceStore((s) => s.linkedSpreadsheetId);
  const setLinkedSpreadsheetId = useCadenceStore((s) => s.setLinkedSpreadsheetId);
  const autoSyncSheets = useCadenceStore((s) => s.autoSyncSheets);
  const setAutoSyncSheets = useCadenceStore((s) => s.setAutoSyncSheets);
  const lastSheetSyncedAt = useCadenceStore((s) => s.lastSheetSyncedAt);
  const syncTasksWithGoogleSheets = useCadenceStore((s) => s.syncTasksWithGoogleSheets);
  const notifications = useCadenceStore((s) => s.notifications);
  const ingestGmailNotifications = useCadenceStore((s) => s.ingestGmailNotifications);
  const userEmail = useCadenceStore((s) => s.userEmail);
  const userUid = useCadenceStore((s) => s.userUid);
  const setAuthUser = useCadenceStore((s) => s.setAuthUser);

  const [driveFiles, setDriveFiles] = useState<Attachment[]>([]);
  const [loadingLive, setLoadingLive] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [copiedOtp, setCopiedOtp] = useState<string | null>(null);
  const [copiedTsv, setCopiedTsv] = useState(false);
  const [liveFeedUrl, setLiveFeedUrl] = useState('');
  const [creatingFeedLink, setCreatingFeedLink] = useState(false);
  const [remoteGTasks, setRemoteGTasks] = useState<Array<{ id: string; title: string; status: string; due?: string }>>([]);
  const [pendingRemoteConfirm, setPendingRemoteConfirm] = useState<
    | { type: 'push_all' }
    | { type: 'delete_remote'; id: string; title: string }
    | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handlePollLiveGmail = async () => {
    setLoadingLive(true);
    try {
      const msgs = await fetchGmailNotificationsLive(userEmail);
      ingestGmailNotifications(msgs, { forceToastNewest: true });
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
          if (res.accessToken) {
            const msgs = await fetchGmailNotificationsLive(res.user.email);
            ingestGmailNotifications(msgs, { forceToastNewest: true });
          }
        } catch {
          // User closed popup
        }
      }
    } finally {
      setLoadingLive(false);
    }
  };

  useEffect(() => {
    if (activeModal === 'gmail' && hasGoogleToken) {
      setLoadingLive(true);
      fetchGmailNotificationsLive(userEmail)
        .then((msgs) => {
          if (msgs.length > 0) {
            ingestGmailNotifications(msgs);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingLive(false));
    }
    if (activeModal === 'drive' && hasGoogleToken) {
      setLoadingLive(true);
      fetchGoogleDriveRecentFiles()
        .then((files) => {
          setDriveFiles(files);
        })
        .catch(() => {})
        .finally(() => setLoadingLive(false));
    }
    if (activeModal === 'tasks_io' && hasGoogleToken) {
      setLoadingLive(true);
      fetchGoogleTasksLive('@default')
        .then((items) => {
          if (Array.isArray(items)) {
            setRemoteGTasks(
              items.map((i) => ({
                id: String(i.id),
                title: String(i.title),
                status: i.status === 'done' ? 'completed' : 'needsAction',
                due: i.due_date || undefined,
              }))
            );
          }
        })
        .catch(() => {})
        .finally(() => setLoadingLive(false));
    }
  }, [activeModal, hasGoogleToken, userEmail, ingestGmailNotifications]);

  const handleConvertEmailToTask = async (msg: GmailNotificationItem) => {
    const isPersonal = msg.subject.toLowerCase().includes('health') || msg.subject.toLowerCase().includes('personal');
    const otp = msg.otpCode || extractOtpFromText(`${msg.subject} ${msg.snippet}`);
    await createTask(
      {
        title: msg.subject,
        description: `From: ${msg.from}\n${otp ? `OTP Code: ${otp}\n` : ''}\n${msg.snippet}`,
        workspace: isPersonal ? 'personal' : 'office',
        priority: otp ? 1 : 2,
        due_date: getTodayStr(),
        source: 'gmail',
        tags: otp ? ['email', 'otp'] : ['email'],
      },
      { openDetail: true }
    );
    addToast({ message: `Converted Gmail thread "${msg.subject}" to task`, tone: 'success' });
    setActiveModal(null);
  };

  const handleAttachDriveFile = async (file: Attachment) => {
    const targetTask =
      tasks.find((t) => t.id === selectedTaskId) || tasks[0];
    if (targetTask) {
      const exists = targetTask.attachments.some((a) => a.id === file.id);
      if (!exists) {
        patchTask(targetTask.id, {
          attachments: [...targetTask.attachments, file],
        });
      }
      addToast({
        message: `Attached "${file.name}" to "${targetTask.title}"`,
        tone: 'success',
      });
    } else {
      await createTask(
        {
          title: `Review ${file.name}`,
          workspace: 'office',
          priority: 2,
          due_date: getTodayStr(),
          attachments: [file],
        },
        { openDetail: true }
      );
      addToast({
        message: `Created task with Drive attachment "${file.name}"`,
        tone: 'success',
      });
    }
    setActiveModal(null);
  };

  const handleExportGoogleTasksJson = () => {
    const googleTasksV1 = {
      kind: 'tasks#tasks',
      etag: `"cadence-${Date.now()}"`,
      items: tasks.map((t) => ({
        kind: 'tasks#task',
        id: t.id,
        title: t.title,
        notes: t.description,
        status: t.status === 'done' ? 'completed' : 'needsAction',
        due: t.due_date ? `${t.due_date}T00:00:00.000Z` : undefined,
        completed: t.completed_at || undefined,
        updated: t.created_at,
        links: t.attachments.map((a) => ({
          type: a.kind,
          description: a.name,
          link: a.url,
        })),
      })),
    };
    const blob = new Blob([JSON.stringify(googleTasksV1, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `google-tasks-v1-${getTodayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ message: 'Exported Google Tasks v1 JSON', tone: 'success' });
  };

  const handleImportGoogleTasksPayload = async (rawPayload: unknown, sourceLabel = 'JSON') => {
    const defaultWs = workspace === 'personal' ? 'personal' : 'office';
    const maxOrder = tasks.reduce((m, t) => (t.sort_order > m ? t.sort_order : m), 0);
    const imported = parseGoogleTasksV1Json(rawPayload, {
      defaultWorkspace: defaultWs,
      baseSortOrder: maxOrder,
      todayStr: getTodayStr(),
    });
    if (imported.length === 0) {
      addToast({
        message: 'No valid Google Tasks v1 items found in JSON.',
        tone: 'warning',
      });
      return;
    }
    await importTasksBatch(imported);
    addToast({
      message: `Imported ${imported.length} task${imported.length > 1 ? 's' : ''} from ${sourceLabel} & synced to Google Sheet`,
      tone: 'success',
    });
    setJsonInput('');
  };

  const handleImportGoogleTasksJson = async () => {
    try {
      const parsed = JSON.parse(jsonInput);
      await handleImportGoogleTasksPayload(parsed, 'Google Tasks v1 JSON');
    } catch {
      addToast({ message: 'Invalid JSON format. Expected Google Tasks v1 shape.', tone: 'danger' });
    }
  };

  const handleUploadJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await handleImportGoogleTasksPayload(parsed, `"${file.name}"`);
    } catch {
      addToast({
        message: `Failed to parse "${file.name}". Ensure it is valid Google Tasks v1 JSON.`,
        tone: 'danger',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePullLiveGoogleTasks = async () => {
    setLoadingLive(true);
    try {
      const maxOrder = tasks.reduce((m, t) => (t.sort_order > m ? t.sort_order : m), 0);
      const pulled = await fetchGoogleTasksLive('@default', maxOrder);
      if (!pulled || pulled.length === 0) {
        addToast({ message: 'Connected to Google Tasks API (0 tasks in @default list)', tone: 'info' });
        return;
      }
      await importTasksBatch(pulled);
      addToast({
        message: `Pulled ${pulled.length} task${pulled.length > 1 ? 's' : ''} from Google Tasks Live API`,
        tone: 'success',
      });
    } catch {
      addToast({ message: 'Sign in with Google first to pull live Google Tasks', tone: 'warning' });
    } finally {
      setLoadingLive(false);
    }
  };

  const handleConfirmPushToGoogleTasks = async () => {
    setPendingRemoteConfirm(null);
    setLoadingLive(true);
    try {
      let pushedCount = 0;
      for (const t of tasks.slice(0, 10)) {
        const created = await createGoogleTaskLive(t, '@default');
        if (created) pushedCount++;
      }
      addToast({
        message:
          pushedCount > 0
            ? `Synced ${pushedCount} task${pushedCount > 1 ? 's' : ''} to Google Tasks API`
            : 'Synced tasks with local Google Tasks mirror & Sheet',
        tone: 'success',
      });
    } catch {
      addToast({ message: 'Sign in with Google first to push to Google Tasks', tone: 'warning' });
    } finally {
      setLoadingLive(false);
    }
  };

  const handleConfirmDeleteRemoteGTask = async (id: string, title: string) => {
    setPendingRemoteConfirm(null);
    try {
      await deleteGoogleTaskLive(id, '@default');
      setRemoteGTasks((prev) => prev.filter((item) => item.id !== id));
      addToast({ message: `Deleted "${title}" from Google Tasks`, tone: 'info' });
    } catch {
      addToast({ message: 'Could not delete remote Google Task', tone: 'warning' });
    }
  };

  const handleCopyTsvForSheets = async () => {
    const tsv = tasksToTsv(tasks);
    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedTsv(true);
      addToast({
        message: `Copied ${tasks.length} tasks in Google Sheets TSV format (Paste into A1)`,
        tone: 'success',
      });
      setTimeout(() => setCopiedTsv(false), 2000);
    } catch {
      addToast({ message: 'Failed to copy to clipboard', tone: 'warning' });
    }
  };

  const handleCreateLiveFeedLink = async () => {
    setCreatingFeedLink(true);
    try {
      const response = await fetch('/api/tasks/sheets-feed-token', {
        method: 'POST',
        headers: userUid ? { 'X-Cadence-User': userUid } : {},
      });
      if (!response.ok) throw new Error('Unable to create a live feed link');
      const data: { path: string; expiresAt: number } = await response.json();
      const url = new URL(data.path, window.location.origin).toString();
      setLiveFeedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        addToast({ message: 'Read-only feed link copied. It expires in 7 days.', tone: 'success' });
      } catch {
        addToast({ message: 'Feed link created. Copy it from the field below.', tone: 'info' });
      }
    } catch (error) {
      addToast({
        message: error instanceof Error ? error.message : 'Could not create feed link',
        tone: 'warning',
      });
    } finally {
      setCreatingFeedLink(false);
    }
  };

  const handleDownloadCsvForSheets = () => {
    const csv = tasksToCsv(tasks);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadence-google-sheets-sync-${getTodayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ message: 'Downloaded Google Sheets CSV sync file', tone: 'success' });
  };

  const handlePullFromGoogleSheet = async () => {
    if (!linkedSpreadsheetId.trim()) {
      addToast({ message: 'Enter a Google Sheet URL or ID to pull rows from', tone: 'warning' });
      return;
    }
    setLoadingLive(true);
    try {
      const maxOrder = tasks.reduce((m, t) => (t.sort_order > m ? t.sort_order : m), 0);
      const imported = await pullTasksFromGoogleSheet(linkedSpreadsheetId, maxOrder);
      if (!imported || imported.length === 0) {
        addToast({
          message: 'Could not read task rows from that Sheet ID. Ensure the sheet is shared or accessible.',
          tone: 'warning',
        });
        return;
      }
      await importTasksBatch(imported);
      addToast({
        message: `Pulled ${imported.length} task${imported.length > 1 ? 's' : ''} from Google Sheet`,
        tone: 'success',
      });
    } catch {
      addToast({
        message: 'Could not read task rows from that Sheet ID. Ensure the sheet is shared or accessible.',
        tone: 'warning',
      });
    } finally {
      setLoadingLive(false);
    }
  };

  return (
    <>
      <CommandPaletteModal />
      <CalendarEventDetailModal />

      {/* Gmail -> Task & OTP Capture Modal */}
      <Modal
        open={activeModal === 'gmail'}
        onClose={() => setActiveModal(null)}
        title="Live Gmail & OTP Inbox Stream"
        subtitle="Polls your real Gmail inbox via Google APIs and converts threads into tasks"
      >
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-[var(--text-2)]">
              {hasGoogleToken
                ? `Connected to live Gmail (${userEmail || 'active'}) · Auto-polling every 15s`
                : 'Sign in with Google to poll your live Gmail inbox in real time:'}
            </span>
            <div className="flex items-center gap-2">
              {hasGoogleToken ? (
                <button
                  type="button"
                  onClick={() => void handlePollLiveGmail()}
                  disabled={loadingLive}
                  className="btn-accent px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLive ? 'animate-spin' : ''}`} />
                  <span>Poll Gmail Now</span>
                </button>
              ) : (
                <GoogleSignInButton compact />
              )}
            </div>
          </div>

          {loadingLive && (
            <div className="text-xs text-[var(--text-3)] flex items-center gap-2 py-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Polling live Gmail messages via Google API...</span>
            </div>
          )}

          {notifications.length === 0 && !loadingLive ? (
            <div className="py-8 text-center text-xs text-[var(--text-3)]">
              {hasGoogleToken
                ? 'No messages found in your Gmail inbox.'
                : 'Connect your Google account above to view and poll your live Gmail messages.'}
            </div>
          ) : (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {notifications.map((msg) => {
                const otp = msg.otpCode || extractOtpFromText(`${msg.subject} ${msg.snippet}`);
                return (
                  <div
                    key={msg.id}
                    className="p-3.5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {otp && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 tnum">
                            <KeyRound className="w-3 h-3" />
                            OTP: {otp}
                          </span>
                        )}
                        <div className="text-xs font-semibold text-[var(--text-1)]">
                          {msg.subject}
                        </div>
                      </div>
                      <div className="text-[11px] text-[var(--text-3)] truncate">
                        {msg.from} · {msg.date}
                      </div>
                      <p className="text-xs text-[var(--text-2)] line-clamp-2">
                        {msg.snippet}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {otp && (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(otp);
                            setCopiedOtp(otp);
                            addToast({ message: `Copied OTP ${otp}`, tone: 'success' });
                            setTimeout(() => setCopiedOtp(null), 1800);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] border border-[#10B981]/30 text-[11px] font-bold inline-flex items-center gap-1 tnum"
                        >
                          {copiedOtp === otp ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedOtp === otp ? 'Copied' : `Copy ${otp}`}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleConvertEmailToTask(msg)}
                        className="btn-accent px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 min-h-[36px]"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>To Task</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Google Drive File Picker Modal */}
      <Modal
        open={activeModal === 'drive'}
        onClose={() => setActiveModal(null)}
        title="Google Drive Attachment Picker"
        subtitle="Attach Docs, Sheets, Slides, or PDFs directly to your tasks"
      >
        <div className="space-y-3">
          {!hasGoogleToken && (
            <div className="p-3 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-2">
              <span className="text-xs text-[var(--text-2)]">
                Sign in with Google to browse your live Google Drive files:
              </span>
              <GoogleSignInButton compact />
            </div>
          )}

          <div className="space-y-2">
            {driveFiles.map((file) => (
              <div
                key={file.id}
                className="p-3 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {file.kind === 'doc' && <FileText className="w-4 h-4 text-[#3B82F6] shrink-0" />}
                  {file.kind === 'sheet' && <FileSpreadsheet className="w-4 h-4 text-[#10B981] shrink-0" />}
                  {file.kind === 'slide' && <Presentation className="w-4 h-4 text-[#F59E0B] shrink-0" />}
                  {file.kind !== 'doc' && file.kind !== 'sheet' && file.kind !== 'slide' && (
                    <FolderOpen className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  )}
                  <div className="truncate">
                    <div className="text-xs font-semibold text-[var(--text-1)] truncate">
                      {file.name}
                    </div>
                    <div className="text-[11px] text-[var(--text-3)] uppercase">
                      Google Drive · {file.kind}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleAttachDriveFile(file)}
                  className="btn-accent px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 min-h-[36px]"
                >
                  Attach
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Google Tasks v1 Import / Export & Google Sheets Sync Hub */}
      <Modal
        open={activeModal === 'tasks_io'}
        onClose={() => {
          setPendingRemoteConfirm(null);
          setActiveModal(null);
        }}
        title="Google Tasks v1 & Google Sheets Sync Hub"
        subtitle="Import/export Google Tasks v1 JSON, manage live Google Tasks CRUD, and sync all tasks with Google Sheets"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
          {/* Section 1: Google Tasks v1 JSON File Upload & Export */}
          <div className="p-4 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileJson className="w-4 h-4 text-[var(--accent)]" />
                <div>
                  <div className="text-xs font-bold text-[var(--text-1)]">
                    Google Tasks v1 JSON Import & Export
                  </div>
                  <div className="text-[11px] text-[var(--text-3)]">
                    Supports `tasks#tasks`, Takeout `tasks#taskLists`, subtasks (`parent`), checklists, and RFC3339 `due` dates
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => void handleUploadJsonFile(e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-accent px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 min-h-[36px]"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload .json File</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportGoogleTasksJson}
                  className="btn-ghost px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 min-h-[36px]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON ({tasks.length})</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <textarea
                rows={4}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='{"kind": "tasks#tasks", "items": [{"id": "gt1", "title": "Prepare quarterly OKRs #office !high", "status": "needsAction", "due": "2026-04-01T09:00:00.000Z"}]}'
                className="input-base w-full p-2.5 rounded-xl text-xs font-mono"
              />
              <div className="flex flex-wrap justify-between items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setJsonInput(
                      JSON.stringify(
                        {
                          kind: 'tasks#tasks',
                          items: [
                            {
                              kind: 'tasks#task',
                              id: 'gt_sample_parent',
                              title: 'Complete Q2 Google Tasks & Sheets Migration #office !urgent',
                              notes:
                                'Ensure full compatibility with Cadence task schema\n- [ ] Verify JSON file upload\n- [x] Map parent subtasks',
                              status: 'needsAction',
                              due: `${getTodayStr()}T14:00:00.000Z`,
                              links: [
                                {
                                  description: 'Migration Spec Sheet',
                                  link: 'https://docs.google.com/spreadsheets/',
                                  type: 'sheet',
                                },
                              ],
                            },
                            {
                              kind: 'tasks#task',
                              id: 'gt_sample_sub',
                              parent: 'gt_sample_parent',
                              title: 'Validate Gmail OTP notification banner',
                              status: 'needsAction',
                            },
                          ],
                        },
                        null,
                        2
                      )
                    )
                  }
                  className="btn-ghost px-3 py-1.5 rounded-xl text-[11px] font-medium"
                >
                  Load sample Google Tasks v1 JSON
                </button>
                <button
                  type="button"
                  onClick={() => void handleImportGoogleTasksJson()}
                  disabled={!jsonInput.trim()}
                  className="btn-accent px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Pasted JSON</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Google Sheets Live Sync */}
          <div className="p-4 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#10B981]" />
                <div>
                  <div className="text-xs font-bold text-[var(--text-1)]">
                    Google Sheets All-Tasks Sync
                  </div>
                  <div className="text-[11px] text-[var(--text-3)]">
                    Every task CRUD action automatically updates the live Google Sheet mirror (`{tasks.length}` tasks)
                  </div>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--text-2)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSyncSheets}
                  onChange={(e) => setAutoSyncSheets(e.target.checked)}
                  className="rounded accent-[var(--accent)]"
                />
                <span>Auto-sync on CRUD</span>
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={linkedSpreadsheetId}
                onChange={(e) => setLinkedSpreadsheetId(e.target.value)}
                placeholder="Optional: Paste Google Sheet URL or Spreadsheet ID for bidirectional pull..."
                className="input-base flex-1 px-3 py-2 rounded-xl text-xs"
              />
              <button
                type="button"
                onClick={() => void handlePullFromGoogleSheet()}
                className="btn-ghost px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-[#10B981]" />
                <span>Pull from Sheet</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-[11px] text-[var(--text-3)] tnum">
                {lastSheetSyncedAt
                  ? `Last synced: ${new Date(lastSheetSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                  : 'Ready to sync all tasks'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void syncTasksWithGoogleSheets(true)}
                  className="btn-accent px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sync All Tasks → Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyTsvForSheets()}
                  className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  {copiedTsv ? <Check className="w-3.5 h-3.5 text-[#10B981]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedTsv ? 'Copied TSV' : 'Copy TSV for Sheet'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsvForSheets}
                  className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateLiveFeedLink()}
                  disabled={creatingFeedLink}
                  className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{creatingFeedLink ? 'Creating link…' : 'Copy live feed link'}</span>
                </button>
              </div>
            </div>
            {liveFeedUrl && (
              <div className="space-y-1.5">
                <label htmlFor="cadence-live-feed-url" className="block text-[10px] font-semibold text-[var(--text-2)]">
                  Read-only link for Google Sheets IMPORTDATA
                </label>
                <input
                  id="cadence-live-feed-url"
                  readOnly
                  value={liveFeedUrl}
                  onFocus={(event) => event.currentTarget.select()}
                  className="input-base w-full px-3 py-2 rounded-lg text-[10px]"
                  aria-describedby="cadence-live-feed-warning"
                />
                <p id="cadence-live-feed-warning" className="text-[10px] leading-relaxed text-[var(--text-3)]">
                  Anyone with this link can read your task export until it expires in 7 days. Creating a new link revokes the previous one.
                </p>
              </div>
            )}
          </div>

          {/* Section 3: Live Google Tasks API Sync (with mandatory confirmation before remote mutation/deletion) */}
          <div className="p-4 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-[#3B82F6]" />
                <div>
                  <div className="text-xs font-bold text-[var(--text-1)]">
                    Google Tasks Live API (`tasks` & `tasks.readonly`)
                  </div>
                  <div className="text-[11px] text-[var(--text-3)]">
                    Pull or push tasks directly with your Google Tasks `@default` list
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!hasGoogleToken ? (
                  <GoogleSignInButton compact />
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void handlePullLiveGoogleTasks()}
                      className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Pull Live Tasks</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingRemoteConfirm({ type: 'push_all' })}
                      className="btn-accent px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Push to Google Tasks</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Confirmation banner required before mutating/deleting remote Google Tasks */}
            {pendingRemoteConfirm && (
              <div className="p-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-[var(--text-1)]">
                  <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                  <span>
                    {pendingRemoteConfirm.type === 'push_all'
                      ? `Confirm pushing ${Math.min(tasks.length, 10)} Cadence tasks to your live Google Tasks list?`
                      : `Confirm deleting "${pendingRemoteConfirm.title}" from your live Google Tasks list?`}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPendingRemoteConfirm(null)}
                    className="btn-ghost px-2.5 py-1 rounded-lg text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (pendingRemoteConfirm.type === 'push_all') {
                        void handleConfirmPushToGoogleTasks();
                      } else {
                        void handleConfirmDeleteRemoteGTask(
                          pendingRemoteConfirm.id,
                          pendingRemoteConfirm.title
                        );
                      }
                    }}
                    className="btn-accent px-3 py-1 rounded-lg text-xs font-semibold"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}

            {remoteGTasks.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-semibold text-[var(--text-3)]">
                  Live Google Tasks (`@default`)
                </div>
                {remoteGTasks.slice(0, 5).map((rt) => (
                  <div
                    key={rt.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-xs"
                  >
                    <span className="truncate font-medium text-[var(--text-1)]">{rt.title}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingRemoteConfirm({
                          type: 'delete_remote',
                          id: rt.id,
                          title: rt.title,
                        })
                      }
                      className="p-1 rounded-lg text-[var(--text-3)] hover:text-[#F43F5E]"
                      title="Delete from Google Tasks"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Keyboard Shortcuts Modal */}
      <Modal
        open={activeModal === 'shortcuts'}
        onClose={() => setActiveModal(null)}
        title="Keyboard Shortcuts"
        subtitle="Navigate Cadence at the speed of thought"
        maxWidth="max-w-md"
      >
        <div className="divide-y divide-[var(--border)] text-xs">
          {[
            { label: 'Command Palette & Search', keys: '⌘K / Ctrl+K' },
            { label: 'New Task Composer', keys: 'N' },
            { label: 'Toggle Navigation Panel', keys: 'B' },
            { label: 'Toggle Dark / Light Theme', keys: 'D' },
            { label: 'Cycle Workspace (All / Office / Personal)', keys: 'W' },
            { label: 'Switch Views (My Day → Insights)', keys: '1 – 6' },
            { label: 'Close Overlays (Modal → Detail → Nav)', keys: 'Esc' },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2.5">
              <span className="text-[var(--text-2)]">{row.label}</span>
              <span className="kbd">{row.keys}</span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
