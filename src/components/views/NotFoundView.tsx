import React from 'react';
import {
  ArrowLeft,
  BarChart3,
  Calendar as CalendarIcon,
  Command,
  Compass,
  Grid2X2,
  Home,
  Kanban,
  ListTodo,
  Search,
  Sparkles,
} from 'lucide-react';
import { useCadenceStore } from '../../store/useCadenceStore';
import { BrandLockup, BrandMark } from '../ui/Brand';
import type { ViewId } from '../../db/schema';

export function NotFoundView() {
  const setActiveView = useCadenceStore((s) => s.setActiveView);
  const setShowLandingPage = useCadenceStore((s) => s.setShowLandingPage);
  const setCommandPaletteOpen = useCadenceStore((s) => s.setCommandPaletteOpen);
  const userEmail = useCadenceStore((s) => s.userEmail);
  const userUid = useCadenceStore((s) => s.userUid);

  const isAuthenticated = Boolean(userEmail || userUid);

  const handleReturnHome = () => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/');
    }
    if (isAuthenticated) {
      setShowLandingPage(false);
      setActiveView('my_day');
    } else {
      setShowLandingPage(true);
    }
  };

  const handleNavigateToView = (view: ViewId) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/${view.replace('_', '-')}`);
    }
    setShowLandingPage(false);
    setActiveView(view);
  };

  const QUICK_LINKS: { id: ViewId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'my_day', label: 'My Day', icon: Sparkles },
    { id: 'board', label: 'Board', icon: Kanban },
    { id: 'list', label: 'List', icon: ListTodo },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { id: 'matrix', label: 'Matrix', icon: Grid2X2 },
    { id: 'insights', label: 'Insights', icon: BarChart3 },
  ];

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden bg-[var(--bg)] text-[var(--text-1)]">
      {/* Background ambient glow */}
      <div className="ambient-glow" aria-hidden="true" />
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-violet-500/10 dark:bg-violet-500/15 rounded-full blur-3xl pointer-events-none" />

      <main className="w-full max-w-2xl mx-auto text-center space-y-8 relative z-10">
        {/* Brand Lockup Header */}
        <div className="flex items-center justify-center mb-2">
          <BrandLockup />
        </div>

        {/* 404 Display Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--surface-2)] border border-[var(--border-strong)] shadow-xs">
          <BrandMark size={22} />
          <span className="font-mono text-xs font-bold text-[var(--accent)] tracking-wider">
            ERROR 404
          </span>
          <span className="text-xs text-[var(--text-3)]">· Page Out of Cadence</span>
        </div>

        {/* Main Headline & Description */}
        <div className="space-y-3">
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-[var(--text-1)] text-balance">
            Looking for rhythm in the wrong place?
          </h1>
          <p className="text-sm sm:text-base text-[var(--text-2)] max-w-lg mx-auto leading-relaxed text-balance">
            The page, view, or link you tried to access doesn't exist or may have been moved. Let's get you back on track to calm execution.
          </p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleReturnHome}
            className="btn-accent px-5 py-3 rounded-2xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 shadow-md hover:scale-[1.02] active:scale-98 transition-all cursor-pointer"
          >
            <Home className="w-4 h-4" />
            <span>{isAuthenticated ? 'Return to Workspace' : 'Go to Homepage'}</span>
          </button>

          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="px-5 py-3 rounded-2xl text-xs sm:text-sm font-semibold bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-1)] border border-[var(--border-strong)] inline-flex items-center gap-2 transition cursor-pointer"
          >
            <Search className="w-4 h-4 text-[var(--accent)]" />
            <span>Search or Quick Command</span>
            <span className="kbd hidden sm:inline-flex items-center gap-0.5 ml-1 text-[10px]">
              <Command className="w-2.5 h-2.5" />
              <span>K</span>
            </span>
          </button>
        </div>

        {/* Quick View Jumps (if authenticated) */}
        {isAuthenticated && (
          <div className="pt-6 border-t border-[var(--border)] space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[var(--text-3)] uppercase tracking-wider">
              <Compass className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Jump directly to a workspace view</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-w-lg mx-auto">
              {QUICK_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavigateToView(item.id)}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-[var(--surface-1)] hover:bg-[var(--surface-3)] border border-[var(--border)] text-left transition cursor-pointer text-xs font-medium text-[var(--text-1)]"
                  >
                    <Icon className="w-4 h-4 text-[var(--accent)] shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Note */}
        <div className="pt-4 text-xs text-[var(--text-3)]">
          Product Developed & Distributed by <span className="font-semibold text-[var(--text-2)]">Jha Solutions</span>
        </div>
      </main>
    </div>
  );
}
