import React, { Suspense, lazy, useEffect } from 'react';
import { MotionConfig, motion } from 'motion/react';
import { AppShell } from './components/shell/Shell';
import { ParticleBurstOverlay, ToastViewport } from './components/ui/Primitives';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { InHouseAssistant } from './components/ui/InHouseAssistant';
import { useCadenceStore } from './store/useCadenceStore';
import { resolveAppRoute } from './lib/routing';
import type { ViewId } from './db/schema';

const MyDayView = lazy(() =>
  import('./components/views/MyDayView').then((m) => ({ default: m.MyDayView }))
);
const BoardView = lazy(() =>
  import('./components/views/BoardView').then((m) => ({ default: m.BoardView }))
);
const ListView = lazy(() =>
  import('./components/views/ListView').then((m) => ({ default: m.ListView }))
);
const CalendarView = lazy(() =>
  import('./components/views/CalendarView').then((m) => ({ default: m.CalendarView }))
);
const MatrixView = lazy(() =>
  import('./components/views/MatrixView').then((m) => ({ default: m.MatrixView }))
);
const InsightsView = lazy(() =>
  import('./components/views/InsightsView').then((m) => ({ default: m.InsightsView }))
);
const NotFoundView = lazy(() =>
  import('./components/views/NotFoundView').then((m) => ({ default: m.NotFoundView }))
);
const LandingWebsite = lazy(() =>
  import('./components/views/LandingWebsite').then((m) => ({ default: m.LandingWebsite }))
);
const TaskComposerModal = lazy(() =>
  import('./components/modals/TaskComposer').then((m) => ({ default: m.TaskComposerModal }))
);
const TaskDetailDrawer = lazy(() =>
  import('./components/modals/TaskDetailDrawer').then((m) => ({ default: m.TaskDetailDrawer }))
);
const EcosystemModals = lazy(() =>
  import('./components/modals/EcosystemModals').then((m) => ({ default: m.EcosystemModals }))
);

/**
 * Runs `task` when the browser is idle and returns a cancel function. The Firebase auth bundle
 * is large, so restoring the session is scheduled during idle time instead of a fixed timer —
 * that keeps it from competing with first paint or task hydration.
 */
function scheduleOnIdle(task: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const idleWindow = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof idleWindow.requestIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(task, { timeout: 2000 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const timer = window.setTimeout(task, 600);
  return () => window.clearTimeout(timer);
}

export default function App() {
  const theme = useCadenceStore((s) => s.theme);
  const workspace = useCadenceStore((s) => s.workspace);
  const activeView = useCadenceStore((s) => s.activeView);
  const composerOpen = useCadenceStore((s) => s.composer.open);
  const selectedTaskId = useCadenceStore((s) => s.selectedTaskId);
  const selectedEvent = useCadenceStore((s) => s.selectedEvent);
  const activeModal = useCadenceStore((s) => s.activeModal);
  const commandPaletteOpen = useCadenceStore((s) => s.commandPaletteOpen);
  const showLandingPage = useCadenceStore((s) => s.showLandingPage);
  const timerRunning = useCadenceStore((s) => s.focusTimer.running);

  const is404 = useCadenceStore((s) => s.routeNotFound);

  // Sync route on initial load and browser back/forward buttons
  useEffect(() => {
    const syncRouteFromPath = () => {
      const match = resolveAppRoute(window.location.pathname);
      const st = useCadenceStore.getState();

      if (!match.isValid) {
        st.setRouteNotFound(true);
        return;
      }

      st.setRouteNotFound(false);
      if (match.view) {
        st.setActiveView(match.view);
      } else if (match.sectionHash) {
        window.setTimeout(() => {
          document.getElementById(match.sectionHash!)?.scrollIntoView({ behavior: 'smooth' });
        }, 120);
      }
    };

    syncRouteFromPath();
    window.addEventListener('popstate', syncRouteFromPath);
    return () => window.removeEventListener('popstate', syncRouteFromPath);
  }, []);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Hydrate local/session data immediately; defer Firebase until after the first paint.
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void useCadenceStore.getState().hydrateFromApi();

    const cancelAuthLoad = scheduleOnIdle(() => {
      void import('./lib/firebase')
        .then(({ fetchFirestoreUserTasksAndEvents, initAuth }) => {
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
            void store.hydrateFromApi();
            try {
              const cloud = await fetchFirestoreUserTasksAndEvents(user.uid);
              if (!active || useCadenceStore.getState().userUid !== user.uid) return;
              if (cloud.tasks.length > 0) store.mergeExternalTasks(cloud.tasks);
              if (cloud.events.length > 0) store.mergeExternalEvents(cloud.events);
            } catch {
              // Keep local task management usable when cloud sync is offline.
            }
          });
        })
        .catch(() => {
          if (!active) return;
          useCadenceStore.getState().setAuthUser({
            uid: null,
            email: null,
            name: null,
            photo: null,
            hasToken: false,
          });
        });
    });

    return () => {
      active = false;
      cancelAuthLoad();
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
        const st = useCadenceStore.getState();
        if (!st.userEmail && !st.userUid) return;
        e.preventDefault();
        st.setRouteNotFound(false);
        st.setShowLandingPage(false);
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
      if (!st.userEmail && !st.userUid) return;

      if (key === 'n') {
        e.preventDefault();
        st.setShowLandingPage(false);
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

  const userEmail = useCadenceStore((s) => s.userEmail);
  const userUid = useCadenceStore((s) => s.userUid);

  // STRICT RULE: Software workspace is ONLY viewable when user is authenticated via Google
  const isAuthenticated = Boolean(userEmail || userUid);
  const canViewSoftware = isAuthenticated && !showLandingPage;

  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <div className={`${wsClass} min-h-dvh bg-[var(--bg)] text-[var(--text-1)] relative`}>
          <div className="ambient-glow" aria-hidden="true" />

          {is404 ? (
            <Suspense fallback={<div className="p-8 text-sm text-[var(--text-3)] animate-pulse">Loading...</div>}>
              <NotFoundView />
            </Suspense>
          ) : canViewSoftware ? (
            <AppShell>
              <ErrorBoundary resetKey={activeView} label="This view">
                <Suspense
                  fallback={
                    <div className="p-8 text-sm text-[var(--text-3)] animate-pulse">
                      Loading workspace view...
                    </div>
                  }
                >
                  {/* Keyed on the view so each switch animates in. Transform/opacity only, so it
                      stays on the compositor and never blocks interaction. */}
                  <motion.div
                    key={activeView}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {activeView === 'my_day' && <MyDayView />}
                    {activeView === 'board' && <BoardView />}
                    {activeView === 'list' && <ListView />}
                    {activeView === 'calendar' && <CalendarView />}
                    {activeView === 'matrix' && <MatrixView />}
                    {activeView === 'insights' && <InsightsView />}
                  </motion.div>
                </Suspense>
              </ErrorBoundary>
            </AppShell>
          ) : (
            <ErrorBoundary label="The landing page">
              <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}><LandingWebsite /></Suspense>
            </ErrorBoundary>
          )}

          {isAuthenticated && (
            <Suspense fallback={null}>
              {composerOpen && <TaskComposerModal />}
              {(selectedTaskId || selectedEvent) && <TaskDetailDrawer />}
              {(activeModal || commandPaletteOpen) && <EcosystemModals />}
            </Suspense>
          )}
          <ToastViewport />
          <ParticleBurstOverlay />
          {canViewSoftware && <InHouseAssistant />}
        </div>
      </MotionConfig>
    </ErrorBoundary>
  );
}
