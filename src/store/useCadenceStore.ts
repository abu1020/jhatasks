import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  CalendarEvent,
  CalendarMode,
  PriorityLevel,
  Task,
  TaskStatus,
  ViewId,
  WorkspaceFilter,
  WorkspaceType,
} from '../db/schema';
import { computeAutoSchedulePlan, getTodayStr, nextRecurrenceDate } from '../lib/dateUtils';
import { classifyGmailMessage, type GmailNotificationItem } from '../lib/nlpParser';
import { playCompletionChime, playTimerCompleteChime } from '../lib/soundAndParticles';
import {
  createTasksInFirestore,
  removeTaskFromFirestore,
  updateTaskInFirestore,
} from '../lib/firebase';

export type ListGroupBy = 'priority' | 'due_date' | 'status';
export type ListSortBy = 'priority' | 'due_date' | 'title' | 'newest';

export interface ToastItem {
  id: string;
  message: string;
  tone?: 'default' | 'warning' | 'danger' | 'success' | 'info';
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  duration?: number;
  gmailMeta?: {
    sender: string;
    subject: string;
    snippet: string;
    category: 'otp' | 'urgent' | 'email';
    otpCode?: string | null;
  };
}

export interface ComposerPresets {
  open: boolean;
  status?: TaskStatus;
  due_date?: string | null;
  due_time?: string | null;
  workspace?: WorkspaceType;
  initialTitle?: string;
}

export interface BurstItem {
  id: string;
  x: number;
  y: number;
}

export interface FocusTimerState {
  taskId: string | null;
  mode: 'focus' | 'break';
  secondsLeft: number;
  running: boolean;
  completedFocusSession: boolean;
}

interface CadenceState {
  // Data
  tasks: Task[];
  events: CalendarEvent[];
  hydrated: boolean;
  loading: boolean;

  // User Auth
  userUid: string | null;
  userEmail: string | null;
  userName: string | null;
  userPhoto: string | null;
  hasGoogleToken: boolean;

  // Persisted Preferences
  theme: 'light' | 'dark';
  workspace: WorkspaceFilter;
  activeView: ViewId;
  calendarMode: CalendarMode;
  calendarDate: string;
  listGroupBy: ListGroupBy;
  listSortBy: ListSortBy;
  showCompleted: boolean;
  wipLimits: Record<TaskStatus, number>;
  linkedSpreadsheetId: string;
  autoSyncSheets: boolean;
  lastSheetSyncedAt: string | null;

  // Ephemeral UI State
  navOpen: boolean;
  settingsOpen: boolean;
  notificationsOpen: boolean;
  notifications: GmailNotificationItem[];
  gmailPollStatus: 'idle' | 'polling' | 'live' | 'needs_auth' | 'error';
  lastGmailPolledAt: string | null;
  hasCompletedInitialGmailPoll: boolean;
  commandPaletteOpen: boolean;
  selectedTaskId: string | null;
  selectedEvent: CalendarEvent | null;
  composer: ComposerPresets;
  searchQuery: string;
  priorityFilter: PriorityLevel | null;
  tagFilter: string | null;
  toasts: ToastItem[];
  bursts: BurstItem[];
  shakingColumn: TaskStatus | null;
  lastDragEndAt: number;
  activeModal: 'gmail' | 'drive' | 'shortcuts' | 'tasks_io' | null;

  // Global Focus Timer
  focusTimer: FocusTimerState;

  // Actions
  setAuthUser: (user: {
    uid: string | null;
    email: string | null;
    name: string | null;
    photo: string | null;
    hasToken: boolean;
  }) => void;
  hydrateFromApi: () => Promise<void>;
  mergeExternalTasks: (incoming: Task[]) => void;
  mergeExternalEvents: (incoming: CalendarEvent[]) => void;

  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setWorkspace: (ws: WorkspaceFilter) => void;
  cycleWorkspace: () => void;
  setActiveView: (view: ViewId) => void;
  setCalendarMode: (mode: CalendarMode) => void;
  setCalendarDate: (dateStr: string) => void;
  setListGroupBy: (group: ListGroupBy) => void;
  setListSortBy: (sort: ListSortBy) => void;
  setShowCompleted: (show: boolean) => void;
  setLinkedSpreadsheetId: (id: string) => void;
  setAutoSyncSheets: (enabled: boolean) => void;
  syncTasksWithGoogleSheets: (showToast?: boolean) => Promise<number>;

  setNavOpen: (open: boolean) => void;
  toggleNav: () => void;
  setSettingsOpen: (open: boolean) => void;
  setNotificationsOpen: (open: boolean) => void;
  setGmailPollStatus: (status: 'idle' | 'polling' | 'live' | 'needs_auth' | 'error') => void;
  addNotification: (item: GmailNotificationItem, showToast?: boolean) => void;
  ingestGmailNotifications: (
    items: GmailNotificationItem[],
    options?: { forceToastNewest?: boolean }
  ) => number;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  dismissNotification: (id: string) => void;

  setCommandPaletteOpen: (open: boolean) => void;
  setSelectedTaskId: (id: string | null) => void;
  setSelectedEvent: (ev: CalendarEvent | null) => void;
  openComposer: (presets?: Partial<Omit<ComposerPresets, 'open'>>) => void;
  closeComposer: () => void;
  setActiveModal: (modal: 'gmail' | 'drive' | 'shortcuts' | 'tasks_io' | null) => void;

  setSearchQuery: (q: string) => void;
  setPriorityFilter: (p: PriorityLevel | null) => void;
  setTagFilter: (tag: string | null) => void;
  clearFilters: () => void;

  recordDragEnd: () => void;
  shouldIgnoreClickAfterDrag: () => boolean;
  triggerColumnShake: (col: TaskStatus) => void;

  addToast: (toast: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
  triggerBurst: (x: number, y: number) => void;

  // Task Mutations
  createTask: (
    partial: Partial<Task> & { title: string },
    options?: { openDetail?: boolean }
  ) => Promise<Task>;
  importTasksBatch: (newTasks: Task[]) => Promise<void>;
  patchTask: (
    id: string,
    patch: Partial<Task>,
    clickCoords?: { x: number; y: number }
  ) => void;
  toggleTaskDone: (id: string, clickCoords?: { x: number; y: number }) => void;
  deleteTaskUndoable: (id: string) => void;
  duplicateTask: (id: string) => Promise<Task | null>;
  planMyDay: () => number;

  // Focus Timer Actions
  startFocusTimer: (taskId: string, mode?: 'focus' | 'break') => void;
  togglePauseFocusTimer: () => void;
  stopFocusTimer: () => void;
  tickFocusTimer: () => void;
}

// Per-task write-behind debounce queues (~350ms) and undo delete timers
const pendingPatches = new Map<string, Partial<Task>>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function sendPatchWithRetry(id: string, patch: Partial<Task>): Promise<boolean> {
  const attempt = async () => {
    const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
      keepalive: true,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  };
  try {
    await attempt();
    return true;
  } catch {
    try {
      await attempt();
      return true;
    } catch {
      return false;
    }
  }
}

function makeId(prefix = 'tsk'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useCadenceStore = create<CadenceState>()(
  persist(
    (set, get) => ({
      tasks: [],
      events: [],
      hydrated: false,
      loading: true,

      userUid: null,
      userEmail: null,
      userName: null,
      userPhoto: null,
      hasGoogleToken: false,

      theme: 'light',
      workspace: 'all',
      activeView: 'my_day',
      calendarMode: 'week',
      calendarDate: getTodayStr(),
      listGroupBy: 'priority',
      listSortBy: 'priority',
      showCompleted: true,
      wipLimits: {
        todo: 12,
        in_progress: 4,
        in_review: 4,
        done: 99,
      },
      linkedSpreadsheetId: 'cadence-master-tasks-sheet',
      autoSyncSheets: true,
      lastSheetSyncedAt: null,

      navOpen: false,
      settingsOpen: false,
      notificationsOpen: false,
      notifications: [],
      gmailPollStatus: 'idle',
      lastGmailPolledAt: null,
      hasCompletedInitialGmailPoll: false,
      commandPaletteOpen: false,
      selectedTaskId: null,
      selectedEvent: null,
      composer: { open: false },
      searchQuery: '',
      priorityFilter: null,
      tagFilter: null,
      toasts: [],
      bursts: [],
      shakingColumn: null,
      lastDragEndAt: 0,
      activeModal: null,

      focusTimer: {
        taskId: null,
        mode: 'focus',
        secondsLeft: 25 * 60,
        running: false,
        completedFocusSession: false,
      },

      setAuthUser: (user) =>
        set({
          userUid: user.uid,
          userEmail: user.email,
          userName: user.name,
          userPhoto: user.photo,
          hasGoogleToken: user.hasToken,
        }),

      hydrateFromApi: async () => {
        if (get().hydrated) return;
        set({ loading: true });
        try {
          const res = await fetch('/api/tasks');
          if (!res.ok) throw new Error('Failed to fetch /api/tasks');
          const data: { tasks: Task[]; events: CalendarEvent[] } = await res.json();
          let events = Array.isArray(data.events) ? data.events : [];
          const tasks = Array.isArray(data.tasks) ? data.tasks : [];

          // HYDRATION RULE: if events are empty call /api/seed; tasks must start EMPTY
          if (events.length === 0) {
            const seedRes = await fetch('/api/seed', { method: 'POST' });
            if (seedRes.ok) {
              const seedData = await seedRes.json();
              if (Array.isArray(seedData.events)) {
                events = seedData.events;
              }
            }
          }

          set({
            tasks,
            events,
            hydrated: true,
            loading: false,
          });
        } catch {
          set({ hydrated: true, loading: false });
        }
      },

      mergeExternalTasks: (incoming) => {
        set((state) => {
          const byId = new Map(state.tasks.map((t) => [t.id, t]));
          for (const t of incoming) {
            byId.set(t.id, t);
          }
          return { tasks: Array.from(byId.values()) };
        });
      },

      mergeExternalEvents: (incoming) => {
        set((state) => {
          const byId = new Map(state.events.map((e) => [e.id, e]));
          for (const e of incoming) {
            byId.set(e.id, e);
          }
          return { events: Array.from(byId.values()) };
        });
      },

      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
      setWorkspace: (workspace) => set({ workspace }),
      cycleWorkspace: () =>
        set((s) => {
          const order: WorkspaceFilter[] = ['all', 'office', 'personal'];
          const next = order[(order.indexOf(s.workspace) + 1) % order.length];
          return { workspace: next };
        }),
      setActiveView: (activeView) => set({ activeView }),
      setCalendarMode: (calendarMode) => set({ calendarMode }),
      setCalendarDate: (calendarDate) => set({ calendarDate }),
      setListGroupBy: (listGroupBy) => set({ listGroupBy }),
      setListSortBy: (listSortBy) => set({ listSortBy }),
      setShowCompleted: (showCompleted) => set({ showCompleted }),
      setLinkedSpreadsheetId: (linkedSpreadsheetId) => set({ linkedSpreadsheetId }),
      setAutoSyncSheets: (autoSyncSheets) => set({ autoSyncSheets }),

      syncTasksWithGoogleSheets: async (showToast = false) => {
        const state = get();
        try {
          const res = await fetch('/api/sheets/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tasks: state.tasks,
              spreadsheetId: state.linkedSpreadsheetId || 'cadence-master-tasks-sheet',
            }),
            keepalive: true,
          });
          if (res.ok) {
            const data = await res.json();
            set({ lastSheetSyncedAt: data.lastSyncedAt || new Date().toISOString() });
            if (showToast) {
              get().addToast({
                message: `Synced all ${state.tasks.length} tasks with Google Sheets`,
                tone: 'success',
              });
            }
            return state.tasks.length;
          }
        } catch {
          // Ignore transient network errors during background sheet sync
        }
        const now = new Date().toISOString();
        set({ lastSheetSyncedAt: now });
        return state.tasks.length;
      },

      setNavOpen: (navOpen) => set({ navOpen }),
      toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
      setSettingsOpen: (settingsOpen) =>
        set({
          settingsOpen,
          ...(settingsOpen ? { notificationsOpen: false } : {}),
        }),
      setNotificationsOpen: (notificationsOpen) =>
        set({
          notificationsOpen,
          ...(notificationsOpen ? { settingsOpen: false } : {}),
        }),
      setGmailPollStatus: (gmailPollStatus) => set({ gmailPollStatus }),

      addNotification: (item, showToast = true) => {
        set((s) => {
          const exists = s.notifications.some((n) => n.id === item.id);
          if (exists) return s;
          return { notifications: [item, ...s.notifications].slice(0, 30) };
        });
        if (showToast) {
          const senderClean = item.from.split('<')[0].replace(/"/g, '').trim() || item.from;
          if (item.otpCode) {
            const code = item.otpCode;
            playCompletionChime();
            get().addToast({
              message: `${senderClean}: ${item.subject}`,
              tone: 'success',
              duration: 9000,
              gmailMeta: {
                sender: senderClean,
                subject: item.subject,
                snippet: item.snippet,
                category: 'otp',
                otpCode: code,
              },
              actionLabel: `Copy ${code}`,
              onAction: () => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(code);
                }
                get().addToast({
                  message: `Copied OTP ${code} to clipboard`,
                  tone: 'success',
                });
              },
              secondaryActionLabel: '+ To Task',
              onSecondaryAction: () => {
                void get().createTask(
                  {
                    title: item.subject,
                    description: `From: ${item.from}\nOTP Code: ${code}\n\n${item.snippet}`,
                    workspace: 'office',
                    priority: 1,
                    due_date: getTodayStr(),
                    source: 'gmail',
                    tags: ['gmail', 'otp'],
                  },
                  { openDetail: true }
                );
              },
            });
          } else {
            get().addToast({
              message: `${senderClean}: ${item.subject}`,
              tone: 'default',
              duration: 7000,
              gmailMeta: {
                sender: senderClean,
                subject: item.subject,
                snippet: item.snippet,
                category: item.category,
                otpCode: null,
              },
              actionLabel: '+ To Task',
              onAction: () => {
                void get().createTask(
                  {
                    title: item.subject,
                    description: `From: ${item.from}\n\n${item.snippet}`,
                    workspace: 'office',
                    priority: item.category === 'urgent' ? 1 : 2,
                    due_date: getTodayStr(),
                    source: 'gmail',
                    tags: ['gmail'],
                  },
                  { openDetail: true }
                );
              },
              secondaryActionLabel: 'Inbox',
              onSecondaryAction: () => {
                set({ notificationsOpen: true });
              },
            });
          }
        }
      },

      ingestGmailNotifications: (items, options) => {
        const state = get();
        const isFirstPoll = !state.hasCompletedInitialGmailPoll;
        const existingMap = new Map(state.notifications.map((n) => [n.id, n]));
        const newOnes = items.filter((it) => !existingMap.has(it.id));

        // Merge while preserving local read state if user already marked a message read
        const merged = items.map((it) => {
          const prev = existingMap.get(it.id);
          return prev ? { ...it, read: prev.read || it.read } : it;
        });

        for (const oldItem of state.notifications) {
          if (!merged.some((m) => m.id === oldItem.id)) {
            merged.push(oldItem);
          }
        }

        set({
          notifications: merged.slice(0, 30),
          gmailPollStatus: 'live',
          lastGmailPolledAt: new Date().toISOString(),
          hasCompletedInitialGmailPoll: true,
        });

        if (newOnes.length === 0 && !options?.forceToastNewest) {
          return 0;
        }

        // Determine which real Gmail messages should surface as non-intrusive toasts:
        // - On subsequent background polls (!isFirstPoll): toast every newly arrived message (up to 2 at once)
        // - On initial poll (isFirstPoll) or manual sync (forceToastNewest): toast the newest unread OTP or newest unread email
        const candidatesToToast = !isFirstPoll
          ? newOnes.slice(0, 2)
          : options?.forceToastNewest
          ? (newOnes.length > 0 ? newOnes.slice(0, 1) : merged.slice(0, 1))
          : newOnes.filter((n) => !n.read && (n.otpCode || n.category === 'urgent')).slice(0, 1);

        for (const msg of candidatesToToast) {
          const senderClean = msg.from.split('<')[0].replace(/"/g, '').trim() || msg.from;
          if (msg.otpCode) {
            const code = msg.otpCode;
            playCompletionChime();
            get().addToast({
              message: `${senderClean}: ${msg.subject}`,
              tone: 'success',
              duration: 9000,
              gmailMeta: {
                sender: senderClean,
                subject: msg.subject,
                snippet: msg.snippet,
                category: 'otp',
                otpCode: code,
              },
              actionLabel: `Copy ${code}`,
              onAction: () => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(code);
                }
                get().addToast({
                  message: `Copied OTP ${code} to clipboard`,
                  tone: 'success',
                });
              },
              secondaryActionLabel: '+ To Task',
              onSecondaryAction: () => {
                void get().createTask(
                  {
                    title: msg.subject,
                    description: `From: ${msg.from}\nOTP Code: ${code}\n\n${msg.snippet}`,
                    workspace: 'office',
                    priority: 1,
                    due_date: getTodayStr(),
                    source: 'gmail',
                    tags: ['gmail', 'otp'],
                  },
                  { openDetail: true }
                );
              },
            });
          } else {
            get().addToast({
              message: `${senderClean}: ${msg.subject}`,
              tone: 'default',
              duration: 7500,
              gmailMeta: {
                sender: senderClean,
                subject: msg.subject,
                snippet: msg.snippet,
                category: msg.category,
                otpCode: null,
              },
              actionLabel: '+ To Task',
              onAction: () => {
                void get().createTask(
                  {
                    title: msg.subject,
                    description: `From: ${msg.from}\n\n${msg.snippet}`,
                    workspace: 'office',
                    priority: msg.category === 'urgent' ? 1 : 2,
                    due_date: getTodayStr(),
                    source: 'gmail',
                    tags: ['gmail'],
                  },
                  { openDetail: true }
                );
              },
              secondaryActionLabel: 'Inbox',
              onSecondaryAction: () => {
                set({ notificationsOpen: true });
              },
            });
          }
        }

        return newOnes.length;
      },

      markNotificationRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),

      markAllNotificationsRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),

      dismissNotification: (id) =>
        set((s) => ({
          notifications: s.notifications.filter((n) => n.id !== id),
        })),

      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
      setSelectedEvent: (selectedEvent) => set({ selectedEvent }),
      openComposer: (presets = {}) =>
        set({
          composer: {
            open: true,
            ...presets,
          },
        }),
      closeComposer: () => set({ composer: { open: false } }),
      setActiveModal: (activeModal) => set({ activeModal }),

      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setPriorityFilter: (priorityFilter) => set({ priorityFilter }),
      setTagFilter: (tagFilter) => set({ tagFilter }),
      clearFilters: () =>
        set({ searchQuery: '', priorityFilter: null, tagFilter: null }),

      recordDragEnd: () => set({ lastDragEndAt: Date.now() }),
      shouldIgnoreClickAfterDrag: () => Date.now() - get().lastDragEndAt < 260,
      triggerColumnShake: (col) => {
        set({ shakingColumn: col });
        setTimeout(() => {
          if (get().shakingColumn === col) {
            set({ shakingColumn: null });
          }
        }, 550);
      },

      addToast: (toast) => {
        const id = makeId('toast');
        const duration = toast.duration ?? (toast.actionLabel ? 6500 : 3000);
        set((s) => ({ toasts: [...s.toasts, { ...toast, id, duration }] }));
        setTimeout(() => {
          get().dismissToast(id);
        }, duration);
        return id;
      },
      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      triggerBurst: (x, y) => {
        const id = makeId('burst');
        set((s) => ({ bursts: [...s.bursts, { id, x, y }] }));
        setTimeout(() => {
          set((s) => ({ bursts: s.bursts.filter((b) => b.id !== id) }));
        }, 700);
      },

      createTask: async (partial, options) => {
        const state = get();
        const maxOrder = state.tasks.reduce(
          (max, t) => (t.sort_order > max ? t.sort_order : max),
          0
        );
        const defaultWs: WorkspaceType =
          state.workspace === 'personal' ? 'personal' : 'office';
        const nowIso = new Date().toISOString();

        const newTask: Task = {
          id: partial.id || makeId('tsk'),
          title: partial.title.trim() || 'Untitled task',
          description: partial.description ?? '',
          workspace: partial.workspace ?? defaultWs,
          status: partial.status ?? 'todo',
          priority: partial.priority ?? 3,
          important: partial.important ?? (partial.priority === 1 || partial.priority === 2),
          quadrant: partial.quadrant ?? null,
          due_date: partial.due_date !== undefined ? partial.due_date : getTodayStr(),
          due_time: partial.due_time ?? null,
          tags: partial.tags ?? [],
          subtasks: partial.subtasks ?? [],
          attachments: partial.attachments ?? [],
          recurrence: partial.recurrence ?? null,
          estimated_minutes: partial.estimated_minutes ?? null,
          actual_minutes: partial.actual_minutes ?? 0,
          sort_order: partial.sort_order ?? maxOrder + 1000,
          source: partial.source ?? 'manual',
          created_at: partial.created_at ?? nowIso,
          completed_at: partial.status === 'done' ? nowIso : null,
        };

        set((s) => ({
          tasks: [...s.tasks, newTask],
          ...(options?.openDetail ? { selectedTaskId: newTask.id } : {}),
        }));

        try {
          const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: [newTask] }),
            keepalive: true,
          });
          if (!res.ok) throw new Error('Failed to create task');
        } catch {
          get().addToast({
            message: 'Could not sync new task to server. Retrying...',
            tone: 'warning',
          });
        }

        if (state.userUid) {
          void createTasksInFirestore([newTask], state.userUid);
        }
        if (get().autoSyncSheets) {
          void get().syncTasksWithGoogleSheets();
        }

        return newTask;
      },

      importTasksBatch: async (newTasks) => {
        if (newTasks.length === 0) return;
        set((s) => {
          const byId = new Map(s.tasks.map((t) => [t.id, t]));
          for (const nt of newTasks) {
            byId.set(nt.id, nt);
          }
          return { tasks: Array.from(byId.values()) };
        });
        try {
          await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: newTasks }),
            keepalive: true,
          });
        } catch {
          get().addToast({
            message: 'Failed to save imported tasks to backend.',
            tone: 'danger',
          });
        }
        const uid = get().userUid;
        if (uid) {
          void createTasksInFirestore(newTasks, uid);
        }
        if (get().autoSyncSheets) {
          void get().syncTasksWithGoogleSheets();
        }
      },

      patchTask: (id, rawPatch, clickCoords) => {
        const state = get();
        const existing = state.tasks.find((t) => t.id === id);
        if (!existing) return;

        const patch: Partial<Task> = { ...rawPatch };

        // Protect against empty title
        if (patch.title !== undefined) {
          const trimmed = patch.title.trim();
          patch.title = trimmed.length > 0 ? trimmed : 'Untitled task';
        }

        // CRITICAL GOTCHA: Clear explicit quadrant whenever priority or important changes directly
        // (unless quadrant itself is explicitly being set in the same patch)
        if (
          (patch.priority !== undefined || patch.important !== undefined) &&
          patch.quadrant === undefined
        ) {
          patch.quadrant = null;
        }

        // Handle status transitions & completion effects
        let spawnedRecurrenceClone: Task | null = null;
        if (patch.status !== undefined && patch.status !== existing.status) {
          if (patch.status === 'done') {
            patch.completed_at = new Date().toISOString();
            playCompletionChime();
            if (clickCoords) {
              get().triggerBurst(clickCoords.x, clickCoords.y);
            }
            if (existing.recurrence) {
              const nextDate = nextRecurrenceDate(
                existing.due_date,
                existing.recurrence
              );
              spawnedRecurrenceClone = {
                ...existing,
                id: makeId('tsk'),
                status: 'todo',
                due_date: nextDate,
                completed_at: null,
                created_at: new Date().toISOString(),
                subtasks: existing.subtasks.map((st) => ({ ...st, done: false })),
                sort_order: existing.sort_order + 500,
              };
            }
          } else if (existing.status === 'done') {
            patch.completed_at = null;
          }
        }

        const updatedTask: Task = { ...existing, ...patch };

        set((s) => ({
          tasks: [
            ...s.tasks.map((t) => (t.id === id ? updatedTask : t)),
            ...(spawnedRecurrenceClone ? [spawnedRecurrenceClone] : []),
          ],
        }));

        if (spawnedRecurrenceClone) {
          const clone = spawnedRecurrenceClone;
          get().addToast({
            message: `Scheduled next recurring instance for ${clone.due_date}`,
            tone: 'success',
          });
          void fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: [clone] }),
            keepalive: true,
          });
          if (state.userUid) {
            void createTasksInFirestore([clone], state.userUid);
          }
        }

        // Debounced (~350ms) per-task write-behind queue
        const prevPending = pendingPatches.get(id) || {};
        const mergedPatch = { ...prevPending, ...patch };
        pendingPatches.set(id, mergedPatch);

        const prevTimer = debounceTimers.get(id);
        if (prevTimer) clearTimeout(prevTimer);

        const timer = setTimeout(async () => {
          const toFlush = pendingPatches.get(id);
          pendingPatches.delete(id);
          debounceTimers.delete(id);
          if (!toFlush) return;

          const ok = await sendPatchWithRetry(id, toFlush);
          if (!ok) {
            get().addToast({
              message: `Failed to save changes to "${updatedTask.title}"`,
              tone: 'danger',
            });
          }
          const uid = get().userUid;
          const latestTask = get().tasks.find((t) => t.id === id);
          if (uid && latestTask) {
            void updateTaskInFirestore(latestTask, uid);
          }
          if (get().autoSyncSheets) {
            void get().syncTasksWithGoogleSheets();
          }
        }, 350);

        debounceTimers.set(id, timer);
      },

      toggleTaskDone: (id, clickCoords) => {
        const task = get().tasks.find((t) => t.id === id);
        if (!task) return;
        const nextStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done';
        get().patchTask(id, { status: nextStatus }, clickCoords);
      },

      deleteTaskUndoable: (id) => {
        const state = get();
        const target = state.tasks.find((t) => t.id === id);
        if (!target) return;

        // Optimistically remove from state
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
        }));

        const deleteTimer = setTimeout(async () => {
          pendingDeleteTimers.delete(id);
          try {
            await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
              method: 'DELETE',
              keepalive: true,
            });
          } catch {
            // Ignore network error if already gone
          }
          const uid = get().userUid;
          if (uid) {
            void removeTaskFromFirestore(id, uid);
          }
          if (get().autoSyncSheets) {
            void get().syncTasksWithGoogleSheets();
          }
        }, 6000);

        pendingDeleteTimers.set(id, deleteTimer);

        get().addToast({
          message: `Deleted "${target.title}"`,
          actionLabel: 'Undo',
          duration: 6500,
          onAction: () => {
            const pending = pendingDeleteTimers.get(id);
            if (pending) {
              clearTimeout(pending);
              pendingDeleteTimers.delete(id);
            }
            set((s) => ({
              tasks: [...s.tasks, target],
            }));
          },
        });
      },

      duplicateTask: async (id) => {
        const orig = get().tasks.find((t) => t.id === id);
        if (!orig) return null;
        const copy = await get().createTask({
          ...orig,
          id: makeId('tsk'),
          title: `${orig.title} (Copy)`,
          status: 'todo',
          completed_at: null,
          created_at: new Date().toISOString(),
          sort_order: orig.sort_order + 250,
        });
        get().addToast({
          message: `Duplicated "${orig.title}"`,
          tone: 'success',
        });
        return copy;
      },

      planMyDay: () => {
        const { tasks, events, workspace } = get();
        const scopedTasks = tasks.filter(
          (t) => workspace === 'all' || t.workspace === workspace
        );
        const plan = computeAutoSchedulePlan(scopedTasks, events, getTodayStr());
        for (const item of plan) {
          get().patchTask(item.id, {
            due_date: item.due_date,
            due_time: item.due_time,
            estimated_minutes: item.estimated_minutes,
          });
        }
        if (plan.length > 0) {
          get().addToast({
            message: `Planned ${plan.length} focus block${plan.length > 1 ? 's' : ''} into free 9:00–18:00 slots`,
            tone: 'success',
          });
        } else {
          get().addToast({
            message: 'No unscheduled tasks available to auto-plan today',
            tone: 'default',
          });
        }
        return plan.length;
      },

      startFocusTimer: (taskId, mode = 'focus') => {
        set({
          focusTimer: {
            taskId,
            mode,
            secondsLeft: mode === 'focus' ? 25 * 60 : 5 * 60,
            running: true,
            completedFocusSession: false,
          },
        });
      },

      togglePauseFocusTimer: () => {
        set((s) => ({
          focusTimer: {
            ...s.focusTimer,
            running: !s.focusTimer.running,
          },
        }));
      },

      stopFocusTimer: () => {
        set({
          focusTimer: {
            taskId: null,
            mode: 'focus',
            secondsLeft: 25 * 60,
            running: false,
            completedFocusSession: false,
          },
        });
      },

      tickFocusTimer: () => {
        const { focusTimer, tasks } = get();
        if (!focusTimer.running || !focusTimer.taskId) return;

        if (focusTimer.secondsLeft > 1) {
          set({
            focusTimer: {
              ...focusTimer,
              secondsLeft: focusTimer.secondsLeft - 1,
            },
          });
          return;
        }

        // Timer completed!
        playTimerCompleteChime();
        if (focusTimer.mode === 'focus') {
          const target = tasks.find((t) => t.id === focusTimer.taskId);
          if (target) {
            get().patchTask(target.id, {
              actual_minutes: (target.actual_minutes || 0) + 25,
            });
          }
          set({
            focusTimer: {
              ...focusTimer,
              secondsLeft: 5 * 60,
              mode: 'break',
              running: false,
              completedFocusSession: true,
            },
          });
          get().addToast({
            message: '25m focus session logged! Ready for a 5m restorative break?',
            actionLabel: 'Start 5m Break',
            duration: 6500,
            onAction: () => {
              if (focusTimer.taskId) {
                get().startFocusTimer(focusTimer.taskId, 'break');
              }
            },
          });
        } else {
          set({
            focusTimer: {
              taskId: focusTimer.taskId,
              mode: 'focus',
              secondsLeft: 25 * 60,
              running: false,
              completedFocusSession: false,
            },
          });
          get().addToast({
            message: 'Break complete! Ready for the next focus sprint.',
            tone: 'success',
          });
        }
      },
    }),
    {
      name: 'cadence-focus-os-prefs',
      partialize: (state) => ({
        theme: state.theme,
        workspace: state.workspace,
        activeView: state.activeView,
        calendarMode: state.calendarMode,
        listGroupBy: state.listGroupBy,
        listSortBy: state.listSortBy,
        showCompleted: state.showCompleted,
        wipLimits: state.wipLimits,
        linkedSpreadsheetId: state.linkedSpreadsheetId,
        autoSyncSheets: state.autoSyncSheets,
      }),
    }
  )
);
