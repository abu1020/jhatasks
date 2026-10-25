import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Flame,
  Plus,
  Sparkles,
} from 'lucide-react';
import {
  addDaysStr,
  computeStreakDays,
  formatHumanDate,
  formatLocalDate,
  getTodayStr,
  parseLocalDate,
} from '../../lib/dateUtils';
import { useCadenceStore } from '../../store/useCadenceStore';
import { EmptyState, WorkspaceDot } from '../ui/Primitives';

export function InsightsView() {
  const tasks = useCadenceStore((s) => s.tasks);
  const openComposer = useCadenceStore((s) => s.openComposer);
  const setSelectedTaskId = useCadenceStore((s) => s.setSelectedTaskId);

  const today = getTodayStr();
  const streak = useMemo(() => computeStreakDays(tasks, today), [tasks, today]);

  // Last 7 days velocity
  const last7Days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, idx) => {
        const dStr = addDaysStr(today, idx - 6);
        const dObj = parseLocalDate(dStr);
        const count = tasks.filter(
          (t) =>
            t.status === 'done' &&
            ((t.completed_at &&
              formatLocalDate(new Date(t.completed_at)) === dStr) ||
              (!t.completed_at && t.due_date === dStr))
        ).length;
        return {
          dateStr: dStr,
          dayLabel: dObj.toLocaleDateString('en-US', { weekday: 'short' }),
          count,
          isToday: dStr === today,
        };
      }),
    [tasks, today]
  );

  const doneThisWeek = useMemo(
    () => last7Days.reduce((acc, d) => acc + d.count, 0),
    [last7Days]
  );

  const focusMinutes7d = useMemo(
    () => tasks.reduce((sum, t) => sum + (t.actual_minutes || 0), 0),
    [tasks]
  );

  const officeCount = useMemo(
    () => tasks.filter((t) => t.workspace === 'office').length,
    [tasks]
  );
  const personalCount = useMemo(
    () => tasks.filter((t) => t.workspace === 'personal').length,
    [tasks]
  );
  const totalTasks = tasks.length;
  const officePct =
    totalTasks > 0 ? Math.round((officeCount / totalTasks) * 100) : 50;
  const personalPct = totalTasks > 0 ? 100 - officePct : 50;

  const recentlyCompleted = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'done')
        .sort((a, b) =>
          (b.completed_at || b.created_at).localeCompare(
            a.completed_at || a.created_at
          )
        )
        .slice(0, 6),
    [tasks]
  );

  const milestone = useMemo(() => {
    if (doneThisWeek >= 8 || streak >= 3) {
      return {
        tier: 'Flow State',
        desc: 'You are maintaining high-velocity execution with consistent daily follow-through.',
      };
    }
    if (doneThisWeek >= 3 || totalTasks >= 4) {
      return {
        tier: 'Finding your rhythm',
        desc: 'Momentum is building. Keep time-blocking your top priorities each morning.',
      };
    }
    return {
      tier: 'Warming up',
      desc: 'Start small by completing 1–2 high-impact tasks and logging a 25m focus session.',
    };
  }, [doneThisWeek, streak, totalTasks]);

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="w-6 h-6" />}
        title="Insights unlock as you complete tasks"
        description="Track your daily streak, 7-day completion velocity, deep-work focus minutes, and Office vs. Personal balance."
        actionLabel="Create your first task"
        onAction={() => openComposer()}
      />
    );
  }

  const maxBar = Math.max(4, ...last7Days.map((d) => d.count));

  // SVG Donut Geometry (r = 52, circumference = 326.72)
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const officeArc = (officePct / 100) * circumference;
  const personalArc = circumference - officeArc;

  return (
    <div className="space-y-6">
      {/* KPI Stat Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-3)]">
            <span>Active Streak</span>
            <Flame className="w-4 h-4 text-[#F59E0B]" />
          </div>
          <div className="font-display text-2xl font-bold text-[var(--text-1)] tnum">
            {streak} {streak === 1 ? 'day' : 'days'}
          </div>
          <div className="text-[11px] text-[var(--text-3)]">
            Consistent daily completions
          </div>
        </div>

        <div className="card p-4.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-3)]">
            <span>Done This Week</span>
            <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
          </div>
          <div className="font-display text-2xl font-bold text-[var(--text-1)] tnum">
            {doneThisWeek}
          </div>
          <div className="text-[11px] text-[var(--text-3)]">
            Completed in last 7 days
          </div>
        </div>

        <div className="card p-4.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-3)]">
            <span>Focus Minutes (7d)</span>
            <Clock className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div className="font-display text-2xl font-bold text-[var(--text-1)] tnum">
            {focusMinutes7d}m
          </div>
          <div className="text-[11px] text-[var(--text-3)]">
            Logged across Pomodoro sprints
          </div>
        </div>

        <div className="card p-4.5 space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-3)]">
            <span>Office / Personal</span>
            <Sparkles className="w-4 h-4 text-[#06B6D4]" />
          </div>
          <div className="font-display text-2xl font-bold text-[var(--text-1)] tnum">
            {officePct}% / {personalPct}%
          </div>
          <div className="text-[11px] text-[var(--text-3)] tnum">
            {officeCount} Office · {personalCount} Personal
          </div>
        </div>
      </div>

      {/* Charts Row: Weekly Velocity Bar Chart + 30-Day Balance Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Velocity Bar Chart (7 cols) */}
        <div className="lg:col-span-7 card p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-display text-sm font-bold text-[var(--text-1)]">
              Weekly Completion Velocity
            </h3>
            <p className="text-xs text-[var(--text-3)]">
              Tasks completed per day over the past 7 days (today highlighted)
            </p>
          </div>

          <div className="h-48 pt-6 flex items-end justify-between gap-3">
            {last7Days.map((d) => {
              const heightPct = Math.max(10, Math.round((d.count / maxBar) * 100));
              return (
                <div
                  key={d.dateStr}
                  className="flex-1 flex flex-col items-center gap-2 h-full justify-end"
                >
                  <span className="text-[11px] font-semibold text-[var(--text-2)] tnum">
                    {d.count}
                  </span>
                  <div className="w-full max-w-[42px] bg-[var(--surface-1)] rounded-xl h-32 flex items-end overflow-hidden p-0.5 border border-[var(--border)]">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${heightPct}%` }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                      className={`w-full rounded-lg ${
                        d.isToday
                          ? 'bg-[var(--accent)]'
                          : 'bg-[var(--text-4)]/45'
                      }`}
                    />
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      d.isToday
                        ? 'text-[var(--accent)] font-bold'
                        : 'text-[var(--text-3)]'
                    }`}
                  >
                    {d.dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 30-Day Work / Personal Balance Donut (5 cols) */}
        <div className="lg:col-span-5 card p-5 flex flex-col justify-between">
          <div>
            <h3 className="font-display text-sm font-bold text-[var(--text-1)]">
              30-Day Workspace Balance
            </h3>
            <p className="text-xs text-[var(--text-3)]">
              Distribution between Office deliverables and Personal life
            </p>
          </div>

          <div className="flex items-center justify-center gap-6 py-4">
            <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
              <svg width={140} height={140} className="-rotate-90">
                {/* Office Arc */}
                <circle
                  cx={70}
                  cy={70}
                  r={radius}
                  fill="none"
                  stroke="#4F46E5"
                  strokeWidth={14}
                  strokeDasharray={`${officeArc} ${circumference}`}
                  strokeDashoffset={0}
                />
                {/* Personal Arc rotated cleanly to start where Office ends */}
                <circle
                  cx={70}
                  cy={70}
                  r={radius}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth={14}
                  strokeDasharray={`${personalArc} ${circumference}`}
                  strokeDashoffset={-officeArc}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display text-lg font-bold text-[var(--text-1)] tnum">
                  {totalTasks}
                </span>
                <span className="text-[10px] text-[var(--text-3)]">Total tasks</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-semibold text-[var(--text-1)]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#4F46E5]" />
                  <span>Office ({officePct}%)</span>
                </div>
                <div className="text-[11px] text-[var(--text-3)] pl-4.5 tnum">
                  {officeCount} tasks tracked
                </div>
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center gap-2 font-semibold text-[var(--text-1)]">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                  <span>Personal ({personalPct}%)</span>
                </div>
                <div className="text-[11px] text-[var(--text-3)] pl-4.5 tnum">
                  {personalCount} tasks tracked
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Milestone + Gentle Observations & Recently Completed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <div className="card p-5 space-y-2 border-[var(--border-strong)] bg-[var(--accent-soft)]">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[var(--accent)]">
              <Award className="w-4 h-4" />
              <span>Current Milestone</span>
            </div>
            <h3 className="font-display text-lg font-bold text-[var(--text-1)]">
              {milestone.tier}
            </h3>
            <p className="text-xs text-[var(--text-2)] leading-relaxed">
              {milestone.desc}
            </p>
          </div>

          <div className="card p-5 space-y-2.5">
            <h3 className="font-display text-xs font-bold text-[var(--text-1)]">
              Gentle Observations
            </h3>
            <ul className="space-y-2 text-xs text-[var(--text-2)]">
              <li>
                • {officePct > 75
                  ? 'Your workload leans heavily toward Office mode—consider scheduling a restorative Personal ritual today.'
                  : 'Your Office and Personal commitments are well-proportioned this week.'}
              </li>
              <li>
                • {focusMinutes7d > 0
                  ? `You have logged ${focusMinutes7d} minutes of focused deep work across Pomodoro sprints.`
                  : 'Try starting a 25-minute Focus Timer on your top priority to build deep-work momentum.'}
              </li>
            </ul>
          </div>
        </div>

        <div className="lg:col-span-7 card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-[var(--text-1)]">
              Recently Completed
            </h3>
            <span className="text-xs text-[var(--text-3)] tnum">
              {recentlyCompleted.length} shown
            </span>
          </div>

          {recentlyCompleted.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-3)]">
              Complete any task to see your accomplishment log here.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {recentlyCompleted.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTaskId(t.id)}
                  className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--surface-1)] px-2 rounded-xl transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                    <span className="text-xs font-medium text-[var(--text-2)] line-through truncate">
                      {t.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <WorkspaceDot workspace={t.workspace} showLabel />
                    <span className="text-[11px] text-[var(--text-3)] tnum">
                      {formatHumanDate(
                        t.completed_at ? t.completed_at.slice(0, 10) : t.due_date,
                        today
                      )}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
