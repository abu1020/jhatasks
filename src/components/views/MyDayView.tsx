import React, { useMemo } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Flame,
  Mail,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Video,
  Wand2,
} from 'lucide-react';
import type { CalendarEvent, Task } from '../../db/schema';
import {
  computeStreakDays,
  computeTodayProgress,
  formatHumanDate,
  formatTime12h,
  getGreetingByHour,
  getTodayStr,
  timeToMinutes,
} from '../../lib/dateUtils';
import { useCadenceStore } from '../../store/useCadenceStore';
import {
  EmptyState,
  PriorityBadge,
  ProgressRing,
  TagChip,
  WorkspaceDot,
} from '../ui/Primitives';
import { EcosystemSyncToolbar } from '../ui/EcosystemSyncToolbar';

type TimelineEntry =
  | { kind: 'event'; time: string; sortMin: number; event: CalendarEvent }
  | { kind: 'task'; time: string; sortMin: number; task: Task };

export function MyDayView() {
  const tasks = useCadenceStore((s) => s.tasks);
  const events = useCadenceStore((s) => s.events);
  const workspace = useCadenceStore((s) => s.workspace);
  const openComposer = useCadenceStore((s) => s.openComposer);
  const setSelectedTaskId = useCadenceStore((s) => s.setSelectedTaskId);
  const setSelectedEvent = useCadenceStore((s) => s.setSelectedEvent);
  const toggleTaskDone = useCadenceStore((s) => s.toggleTaskDone);
  const startFocusTimer = useCadenceStore((s) => s.startFocusTimer);
  const planMyDay = useCadenceStore((s) => s.planMyDay);
  const setActiveModal = useCadenceStore((s) => s.setActiveModal);

  const today = getTodayStr();
  const greeting = getGreetingByHour();

  const scopedTasks = useMemo(
    () => tasks.filter((t) => workspace === 'all' || t.workspace === workspace),
    [tasks, workspace]
  );

  const todayEvents = useMemo(
    () =>
      events
        .filter((e) => e.date === today)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [events, today]
  );

  // Exact shared completion formula matching the Topbar header
  const todayStats = useMemo(
    () => computeTodayProgress(scopedTasks, today),
    [scopedTasks, today]
  );

  const streakDays = useMemo(
    () => computeStreakDays(scopedTasks, today),
    [scopedTasks, today]
  );

  const timedTodayTasks = useMemo(
    () =>
      scopedTasks
        .filter((t) => t.due_date === today && Boolean(t.due_time))
        .sort((a, b) => (a.due_time || '').localeCompare(b.due_time || '')),
    [scopedTasks, today]
  );

  const anytimeTodayTasks = useMemo(
    () =>
      scopedTasks
        .filter(
          (t) =>
            (t.due_date === today && !t.due_time) ||
            (t.status === 'done' &&
              t.completed_at?.slice(0, 10) === today &&
              t.due_date !== today)
        )
        .sort((a, b) => {
          if (a.status === 'done' && b.status !== 'done') return 1;
          if (a.status !== 'done' && b.status === 'done') return -1;
          return a.priority - b.priority || a.sort_order - b.sort_order;
        }),
    [scopedTasks, today]
  );

  const mergedTimeline = useMemo<TimelineEntry[]>(() => {
    const list: TimelineEntry[] = [];
    for (const ev of todayEvents) {
      list.push({
        kind: 'event',
        time: ev.start_time,
        sortMin: timeToMinutes(ev.start_time),
        event: ev,
      });
    }
    for (const tk of timedTodayTasks) {
      const tm = tk.due_time || '09:00';
      list.push({
        kind: 'task',
        time: tm,
        sortMin: timeToMinutes(tm),
        task: tk,
      });
    }
    return list.sort((a, b) => a.sortMin - b.sortMin);
  }, [todayEvents, timedTodayTasks]);

  const topPriorities = useMemo(
    () =>
      scopedTasks
        .filter((t) => t.status !== 'done' && (t.priority === 1 || t.priority === 2))
        .sort((a, b) => a.priority - b.priority || a.sort_order - b.sort_order)
        .slice(0, 5),
    [scopedTasks]
  );

  const ritualsToday = useMemo(
    () =>
      scopedTasks
        .filter((t) => Boolean(t.recurrence) && t.status !== 'done')
        .slice(0, 5),
    [scopedTasks]
  );

  const upNextTasks = useMemo(
    () =>
      scopedTasks
        .filter((t) => t.status !== 'done' && (!t.due_date || t.due_date > today))
        .sort((a, b) =>
          (a.due_date || '9999-99-99').localeCompare(b.due_date || '9999-99-99')
        )
        .slice(0, 5),
    [scopedTasks, today]
  );

  const dateFullString = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <section className="card p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-medium text-[var(--text-3)]">
            {dateFullString}
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-[var(--text-1)] tracking-tight text-balance">
            {greeting}. Ready for calm, focused execution?
          </h2>
          <p className="text-xs sm:text-sm text-[var(--text-2)] tnum">
            {todayStats.openDueTodayCount}{' '}
            {todayStats.openDueTodayCount === 1 ? 'task' : 'tasks'} remaining today
            {' · '}
            {todayEvents.length}{' '}
            {todayEvents.length === 1 ? 'Google Calendar event' : 'Google Calendar events'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Today Progress Card */}
          <div className="flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)]">
            <ProgressRing percentage={todayStats.percentage} size={36} strokeWidth={3.5} />
            <div>
              <div className="text-xs font-bold text-[var(--text-1)] tnum">
                {todayStats.completedTodayCount}/{todayStats.totalCount} Done
              </div>
              <div className="text-[11px] text-[var(--text-3)] tnum">
                {todayStats.percentage}% of today
              </div>
            </div>
          </div>

          {/* Streak Counter */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)]">
            <Flame className="w-4 h-4 text-[#F59E0B]" />
            <div>
              <div className="text-xs font-bold text-[var(--text-1)] tnum">
                {streakDays}d Streak
              </div>
              <div className="text-[11px] text-[var(--text-3)]">Daily rhythm</div>
            </div>
          </div>

          {/* Plan My Day Auto-Scheduler */}
          <button
            type="button"
            onClick={planMyDay}
            className="btn-accent px-4 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 min-h-[40px] whitespace-nowrap"
          >
            <Wand2 className="w-4 h-4" />
            <span>Plan my day</span>
          </button>
        </div>
      </section>

      {/* Google Tasks & Gmail Live Sync Toolbar */}
      <EcosystemSyncToolbar />

      {/* First-Run Empty State when user has 0 tasks */}
      {scopedTasks.length === 0 && (
        <EmptyState
          icon={<Sparkles className="w-6 h-6" />}
          title="Your day is a clean canvas"
          description="Capture your first task using natural language (#office, !urgent, tomorrow at 10am), or convert starred threads from Gmail."
          actionLabel="Add your first task"
          onAction={() => openComposer({ due_date: today })}
          secondaryLabel="Import from Gmail"
          onSecondaryAction={() => setActiveModal('gmail')}
        />
      )}

      {/* Two-Column Layout: Left Timeline + Anytime Today | Right Rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 cols: Today's Schedule Timeline + Anytime Today */}
        <div className="lg:col-span-8 space-y-6 min-w-0">
          {/* Schedule Timeline */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-[var(--text-1)]">
                  Today's Schedule Timeline
                </h3>
                <p className="text-xs text-[var(--text-3)]">
                  Google Calendar events merged with time-blocked focus tasks
                </p>
              </div>
              <button
                type="button"
                onClick={() => openComposer({ due_date: today, due_time: '10:00' })}
                className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 min-h-[36px] whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add time block</span>
              </button>
            </div>

            {mergedTimeline.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--text-3)]">
                No time-specific meetings or tasks scheduled for today yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {mergedTimeline.map((entry) => {
                  if (entry.kind === 'event') {
                    const ev = entry.event;
                    return (
                      <div
                        key={`ev_${ev.id}`}
                        onClick={() => setSelectedEvent(ev)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedEvent(ev);
                          }
                        }}
                        className="group flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--border-strong)] cursor-pointer transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="w-1.5 h-9 rounded-full shrink-0"
                            style={{ backgroundColor: ev.color || '#4F46E5' }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[var(--text-1)] truncate">
                                {ev.title}
                              </span>
                              <span className="text-[11px] text-[var(--text-3)] whitespace-nowrap">
                                · Google Calendar
                              </span>
                            </div>
                            <div className="text-[11px] text-[var(--text-3)] tnum">
                              {formatTime12h(ev.start_time)} – {formatTime12h(ev.end_time)}
                              {ev.location ? ` · ${ev.location}` : ''}
                            </div>
                          </div>
                        </div>

                        {ev.meet_link && (
                          <a
                            href={ev.meet_link}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[#4F46E5]/12 text-[var(--accent)] hover:bg-[#4F46E5]/20 inline-flex items-center gap-1.5 shrink-0"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Meet</span>
                          </a>
                        )}
                      </div>
                    );
                  }

                  const tk = entry.task;
                  const done = tk.status === 'done';
                  return (
                    <div
                      key={`tk_${tk.id}`}
                      onClick={() => setSelectedTaskId(tk.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSelectedTaskId(tk.id);
                      }}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-strong)] cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskDone(tk.id, { x: e.clientX, y: e.clientY });
                          }}
                          aria-label={
                            done
                              ? `Mark "${tk.title}" incomplete`
                              : `Complete "${tk.title}"`
                          }
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                            done
                              ? 'bg-[#10B981] border-[#10B981] text-white'
                              : 'border-[var(--border-strong)] hover:border-[var(--accent)]'
                          }`}
                        >
                          {done && <Check className="w-3.5 h-3.5" />}
                        </button>
                        <div className="min-w-0">
                          <div
                            className={`text-xs font-semibold truncate ${
                              done
                                ? 'line-through text-[var(--text-3)]'
                                : 'text-[var(--text-1)]'
                            }`}
                          >
                            {tk.title}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)] tnum">
                            <span>{formatTime12h(tk.due_time)}</span>
                            {tk.estimated_minutes && <span>· {tk.estimated_minutes}m</span>}
                            <WorkspaceDot workspace={tk.workspace} showLabel />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBadge priority={tk.priority} short />
                        {!done && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startFocusTimer(tk.id, 'focus');
                            }}
                            aria-label={`Start 25 minute focus timer for ${tk.title}`}
                            className="btn-ghost p-1.5 rounded-lg"
                          >
                            <Play className="w-3.5 h-3.5 text-[var(--accent)]" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Anytime Today Section */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold text-[var(--text-1)]">
                  Anytime Today
                </h3>
                <p className="text-xs text-[var(--text-3)]">
                  Flexible tasks due today without a fixed clock slot
                </p>
              </div>
              <button
                type="button"
                onClick={() => openComposer({ due_date: today })}
                className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 min-h-[36px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add task</span>
              </button>
            </div>

            {anytimeTodayTasks.length === 0 ? (
              <div className="py-6 text-center text-xs text-[var(--text-3)]">
                No unscheduled tasks due today. Click "Add task" or press N to capture one.
              </div>
            ) : (
              <div className="space-y-2">
                {anytimeTodayTasks.map((tk) => {
                  const done = tk.status === 'done';
                  return (
                    <div
                      key={tk.id}
                      onClick={() => setSelectedTaskId(tk.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSelectedTaskId(tk.id);
                      }}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] hover:border-[var(--border-strong)] cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskDone(tk.id, { x: e.clientX, y: e.clientY });
                          }}
                          aria-label={
                            done
                              ? `Mark "${tk.title}" incomplete`
                              : `Complete "${tk.title}"`
                          }
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                            done
                              ? 'bg-[#10B981] border-[#10B981] text-white'
                              : 'border-[var(--border-strong)] hover:border-[var(--accent)]'
                          }`}
                        >
                          {done && <Check className="w-3.5 h-3.5" />}
                        </button>
                        <div className="min-w-0">
                          <div
                            className={`text-xs font-semibold truncate ${
                              done
                                ? 'line-through text-[var(--text-3)]'
                                : 'text-[var(--text-1)]'
                            }`}
                          >
                            {tk.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5">
                            <WorkspaceDot workspace={tk.workspace} showLabel />
                            {tk.estimated_minutes && (
                              <span className="text-[11px] text-[var(--text-3)] tnum">
                                · {tk.estimated_minutes}m
                              </span>
                            )}
                            {tk.tags.map((tg) => (
                              <TagChip key={tg} tag={tg} />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <PriorityBadge priority={tk.priority} short />
                        {!done && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              startFocusTimer(tk.id, 'focus');
                            }}
                            aria-label={`Start focus timer for ${tk.title}`}
                            className="btn-ghost p-1.5 rounded-lg"
                          >
                            <Play className="w-3.5 h-3.5 text-[var(--accent)]" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Rail (4 cols): Top Priorities, Rituals Today, Up Next */}
        <div className="lg:col-span-4 space-y-5 min-w-0">
          {/* Top Priorities */}
          <div className="card p-4.5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-bold text-[var(--text-1)]">
                Top Priorities (Urgent & High)
              </h3>
              <span className="text-xs text-[var(--text-3)] tnum">
                {topPriorities.length}
              </span>
            </div>
            {topPriorities.length === 0 ? (
              <p className="text-xs text-[var(--text-3)] py-2">
                No urgent or high-priority tasks open right now.
              </p>
            ) : (
              <div className="space-y-2">
                {topPriorities.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTaskId(t.id)}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--surface-1)] hover:bg-[var(--surface-3)] text-left transition"
                  >
                    <span className="text-xs font-medium text-[var(--text-1)] truncate">
                      {t.title}
                    </span>
                    <PriorityBadge priority={t.priority} short />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Rituals Today (Recurring) */}
          <div className="card p-4.5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-bold text-[var(--text-1)] inline-flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Rituals & Habits</span>
              </h3>
              <span className="text-xs text-[var(--text-3)] tnum">
                {ritualsToday.length}
              </span>
            </div>
            {ritualsToday.length === 0 ? (
              <p className="text-xs text-[var(--text-3)] py-2">
                Add `daily` or `every weekday` in the task composer to build recurring rituals.
              </p>
            ) : (
              <div className="space-y-2">
                {ritualsToday.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTaskId(t.id)}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--surface-1)] hover:bg-[var(--surface-3)] text-left transition"
                  >
                    <span className="text-xs font-medium text-[var(--text-1)] truncate">
                      {t.title}
                    </span>
                    <span className="text-[11px] text-[var(--text-3)] capitalize shrink-0">
                      {t.recurrence}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Up Next */}
          <div className="card p-4.5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-bold text-[var(--text-1)] inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[var(--text-3)]" />
                <span>Up Next</span>
              </h3>
              <span className="text-xs text-[var(--text-3)] tnum">
                {upNextTasks.length}
              </span>
            </div>
            {upNextTasks.length === 0 ? (
              <p className="text-xs text-[var(--text-3)] py-2">
                No upcoming tasks queued after today.
              </p>
            ) : (
              <div className="space-y-2">
                {upNextTasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTaskId(t.id)}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--surface-1)] hover:bg-[var(--surface-3)] text-left transition"
                  >
                    <span className="text-xs font-medium text-[var(--text-1)] truncate">
                      {t.title}
                    </span>
                    <span className="text-[11px] text-[var(--text-3)] tnum shrink-0">
                      {formatHumanDate(t.due_date, today)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
