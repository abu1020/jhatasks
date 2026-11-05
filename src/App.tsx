import React, { Suspense, lazy, useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { AppShell } from './components/shell/Shell';
import { ParticleBurstOverlay, ToastViewport } from './components/ui/Primitives';
import { InHouseAssistant } from './components/ui/InHouseAssistant';

const MyDayView = lazy(() => import('./components/views/MyDayView').then((m) => ({ default: m.MyDayView })));
const BoardView = lazy(() => import('./components/views/BoardView').then((m) => ({ default: m.BoardView })));
const ListView = lazy(() => import('./components/views/ListView').then((m) => ({ default: m.ListView })));
const CalendarView = lazy(() => import('./components/views/CalendarView').then((m) => ({ default: m.CalendarView })));
const MatrixView = lazy(() => import('./components/views/MatrixView').then((m) => ({ default: m.MatrixView })));
const InsightsView = lazy(() => import('./components/views/InsightsView').then((m) => ({ default: m.InsightsView })));
const TaskComposerModal = lazy(() => import('./components/modals/TaskComposer').then((m) => ({ default: m.TaskComposerModal })));
const TaskDetailDrawer = lazy(() => import('./components/modals/TaskDetailDrawer').then((m) => ({ default: m.TaskDetailDrawer })));
const EcosystemModals = lazy(() => import('./components/modals/EcosystemModals').then((m) => ({ default: m.EcosystemModals })));
import { useCadenceStore } from './store/useCadenceStore';
import type { ViewId } from './db/schema';

export default function App() {
  const theme = useCadenceStore((s) => s.theme);
  const workspace = useCadenceStore((s) => s.workspace);
  const activeView = useCadenceStore((s) => s.activeView);
  const composerOpen = useCadenceStore((s) => s.composer.open);
  const selectedTaskId = useCadenceStore((s) => s.selectedTaskId);
  const selectedEvent = useCadenceStore((s) => s.selectedEvent);
  const activeModal = useCadenceStore((s) => s.activeModal);
  const commandPaletteOpen = useCadenceStore((s) => s.commandPaletteOpen);
  const timerRunning = useCadenceStore((s) => s.focusTimer.running);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Fetch local tasks immediately; load Firebase after first paint so auth code does not compete with first interaction.
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void useCadenceStore.getState().hydrateFromApi();

    const authLoadTimer = window.setTimeout(() => {
      void import('./lib/firebase')
        .then(({ initAuth, fetchFirestoreUserTasksAndEvents }) => {
          if (!active) return;
          unsubscribe = initAuth(async (user, token) => {
            if (!active) return;
            const store = useCadenceStore.getState();
            if (!user) {
              store.setAuthUser({
                uid: null,
                email: null,
                name: null,
                photo: null,
                hasToken: false,
              });
              return;
            }

            store.setAuthUser({
              uid: user.uid,
              email: user.email,
              name: user.displayName,
              photo: user.photoURL,
              hasToken: Boolean(token),
            });
            try {
              const cloud = await fetchFirestoreUserTasksAndEvents(user.uid);
              if (!active) return;
              if (cloud.tasks.length > 0) store.mergeExternalTasks(cloud.tasks);
              if (cloud.events.length > 0) store.mergeExternalEvents(cloud.events);
            } catch {
              // Keep the local task view available when cloud sync is offline.
            }
          });
        })
        .catch(() => {
          if (!active) return;
          // Firebase is optional for local task management; report no auth session if unavailable.
          useCadenceStore.getState().setAuthUser({
            uid: null,
            email: null,
            name: null,
            photo: null,
            hasToken: false,
          });
        });
    }, 500);

    return () => {
      active = false;
      window.clearTimeout(authLoadTimer);
      unsubscribe?.();
    };
  }, []);

  // ONE interval at app root, gated strictly on timerRunning
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      useCadenceStore.getState().tickFocusTimer();
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  // Global keyboard shortcuts: ⌘K palette, N new task, B navigation, D theme, W cycle workspace, 1–6 views, Esc closes in order (modal -> task panel -> nav)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'combobox');

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const st = useCadenceStore.getState();
        st.setCommandPaletteOpen(!st.commandPaletteOpen);
        return;
      }

      if (e.key === 'Escape') {
        const st = useCadenceStore.getState();
        // Order: modal/composer/palette/settings -> task panel -> nav
        if (st.commandPaletteOpen) {
          st.setCommandPaletteOpen(false);
          return;
        }
        if (st.composer.open) {
          st.closeComposer();
          return;
        }
        if (st.activeModal) {
          st.setActiveModal(null);
          return;
        }
        if (st.selectedEvent) {
          st.setSelectedEvent(null);
          return;
        }
        if (st.settingsOpen) {
          st.setSettingsOpen(false);
          return;
        }
        if (st.selectedTaskId) {
          st.setSelectedTaskId(null);
          return;
        }
        if (st.navOpen) {
          st.setNavOpen(false);
          return;
        }
        return;
      }

      if (isEditable || e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const st = useCadenceStore.getState();

      if (key === 'n') {
        e.preventDefault();
        st.openComposer();
      } else if (key === 'b') {
        e.preventDefault();
        st.toggleNav();
      } else if (key === 'd') {
        e.preventDefault();
        st.toggleTheme();
      } else if (key === 'w') {
        e.preventDefault();
        st.cycleWorkspace();
      } else if (['1', '2', '3', '4', '5', '6'].includes(key)) {
        e.preventDefault();
        const views: ViewId[] = [
          'my_day',
          'board',
          'list',
          'calendar',
          'matrix',
          'insights',
        ];
        st.setActiveView(views[Number(key) - 1]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const wsClass =
    workspace === 'office'
      ? 'ws-office'
      : workspace === 'personal'
      ? 'ws-personal'
      : 'ws-all';

  return (
    <MotionConfig reducedMotion="user">
      <div className={`${wsClass} min-h-dvh bg-[var(--bg)] text-[var(--text-1)] relative`}>
        <div className="ambient-glow" aria-hidden="true" />

        <AppShell>
          <Suspense fallback={<div className="mx-auto w-full max-w-7xl px-4 py-6" role="status" aria-label="Loading view"><div className="skeleton h-28 w-full mb-5" /><div className="grid grid-cols-1 lg:grid-cols-3 gap-4"><div className="skeleton h-64" /><div className="skeleton h-64" /><div className="skeleton h-64" /></div></div>}>
            {activeView === 'my_day' && <MyDayView />}
            {activeView === 'board' && <BoardView />}
            {activeView === 'list' && <ListView />}
            {activeView === 'calendar' && <CalendarView />}
            {activeView === 'matrix' && <MatrixView />}
            {activeView === 'insights' && <InsightsView />}
          </Suspense>
        </AppShell>

        <Suspense fallback={null}>
          {composerOpen && <TaskComposerModal />}
          {selectedTaskId && <TaskDetailDrawer />}
          {(activeModal || selectedEvent || commandPaletteOpen) && <EcosystemModals />}
        </Suspense>
        <ToastViewport />
        <ParticleBurstOverlay />
        <InHouseAssistant />
      </div>
    </MotionConfig>
  );
}
