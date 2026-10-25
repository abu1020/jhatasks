import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  GripVertical,
  MapPin,
  Plus,
  Video,
} from 'lucide-react';
import {
  PRIORITY_META,
  type CalendarEvent,
  type CalendarMode,
  type Task,
} from '../../db/schema';
import {
  addDaysStr,
  addMonthsStr,
  formatHumanDate,
  formatTime12h,
  getLocalTimezoneLabel,
  getMonthGridDates,
  getStartOfWeekMonday,
  getTodayStr,
  layoutCollisionClusters,
  parseLocalDate,
  timeToMinutes,
} from '../../lib/dateUtils';
import { useCadenceStore } from '../../store/useCadenceStore';
import { GlobalFilterBar, useFilteredTasks } from '../ui/FilterBar';
import { PriorityBadge, SegmentedControl, WorkspaceDot } from '../ui/Primitives';

const HOUR_HEIGHT = 68; // 68px per hour
const START_HOUR = 6; // 06:00
const END_HOUR = 22; // 22:00
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function DraggableTaskChip({
  task,
  compact = false,
}: {
  task: Task;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `caltask_${task.id}`,
    data: { task },
  });
  const setSelectedTaskId = useCadenceStore((s) => s.setSelectedTaskId);
  const shouldIgnoreClickAfterDrag = useCadenceStore(
    (s) => s.shouldIgnoreClickAfterDrag
  );

  const meta = PRIORITY_META[task.priority];

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        if (shouldIgnoreClickAfterDrag()) return;
        setSelectedTaskId(task.id);
      }}
      style={{
        opacity: isDragging ? 0.35 : 1,
        borderColor: meta.border,
        backgroundColor: meta.bg,
      }}
      className={`rounded-lg border px-2 py-1 text-[11px] font-medium text-[var(--text-1)] cursor-grab active:cursor-grabbing select-none touch-none flex items-center justify-between gap-1.5 ${
        compact ? 'truncate' : ''
      }`}
    >
      <span className="truncate">
        {task.due_time ? `${task.due_time} ` : ''}
        {task.title}
      </span>
      <GripVertical className="w-3 h-3 text-[var(--text-3)] shrink-0" />
    </div>
  );
}

function DroppableMonthCell({
  dateStr,
  isCurrentMonth,
  isToday,
  isSelected,
  events,
  tasks,
  onSelectDate,
}: {
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
  tasks: Task[];
  onSelectDate: (d: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `monthday_${dateStr}`,
    data: { type: 'month_day', date: dateStr },
  });
  const setSelectedEvent = useCadenceStore((s) => s.setSelectedEvent);
  const openComposer = useCadenceStore((s) => s.openComposer);

  const dayNum = Number(dateStr.slice(8, 10));
  const combinedCount = events.length + tasks.length;
  const visibleEvents = events.slice(0, 2);
  const remainingSlots = Math.max(0, 3 - visibleEvents.length);
  const visibleTasks = tasks.slice(0, remainingSlots);
  const overflowCount = Math.max(
    0,
    combinedCount - (visibleEvents.length + visibleTasks.length)
  );

  return (
    <div
      ref={setNodeRef}
      onClick={() => onSelectDate(dateStr)}
      onDoubleClick={() => openComposer({ due_date: dateStr })}
      className={`min-h-[104px] p-2 border-b border-r border-[var(--border)] flex flex-col justify-between transition cursor-pointer ${
        !isCurrentMonth ? 'opacity-45 bg-[var(--surface-1)]' : 'bg-[var(--surface-2)]'
      } ${isOver ? 'ring-2 ring-inset ring-[var(--accent)] bg-[var(--accent-soft)]' : ''} ${
        isSelected ? 'bg-[var(--surface-1)]' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`w-6 h-6 rounded-full text-xs font-semibold inline-flex items-center justify-center tnum ${
            isToday
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-2)]'
          }`}
        >
          {dayNum}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openComposer({ due_date: dateStr });
          }}
          aria-label={`Add task on ${dateStr}`}
          className="opacity-0 hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-[var(--surface-3)] text-[var(--text-3)]"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-1 mt-1">
        {visibleEvents.map((ev) => (
          <div
            key={ev.id}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedEvent(ev);
            }}
            style={{
              backgroundColor: `${ev.color || '#4F46E5'}18`,
              borderColor: `${ev.color || '#4F46E5'}45`,
            }}
            className="px-1.5 py-0.5 rounded border text-[10px] font-medium text-[var(--text-1)] truncate"
          >
            <span className="font-mono tnum mr-1 text-[var(--text-2)]">
              {ev.start_time}
            </span>
            {ev.title}
          </div>
        ))}
        {visibleTasks.map((tk) => (
          <DraggableTaskChip key={tk.id} task={tk} compact />
        ))}
        {overflowCount > 0 && (
          <div className="text-[10px] font-semibold text-[var(--accent)] px-1">
            +{overflowCount} more
          </div>
        )}
      </div>
    </div>
  );
}

function DroppableAllDayCell({
  dateStr,
  tasks,
}: {
  dateStr: string;
  tasks: Task[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `allday_${dateStr}`,
    data: { type: 'all_day', date: dateStr },
  });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[42px] p-1.5 border-l border-[var(--border)] space-y-1 transition ${
        isOver ? 'bg-[var(--accent-soft)]' : ''
      }`}
    >
      {tasks.map((tk) => (
        <DraggableTaskChip key={tk.id} task={tk} compact />
      ))}
    </div>
  );
}

function HalfHourSlot({
  dateStr,
  timeStr,
}: {
  dateStr: string;
  timeStr: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot_${dateStr}_${timeStr}`,
    data: { type: 'time_slot', date: dateStr, time: timeStr },
  });
  const openComposer = useCadenceStore((s) => s.openComposer);

  return (
    <div
      ref={setNodeRef}
      onClick={() => openComposer({ due_date: dateStr, due_time: timeStr })}
      style={{ height: HOUR_HEIGHT / 2 }}
      className={`group relative border-b border-[var(--border)]/50 cursor-pointer transition ${
        isOver ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-1)]'
      }`}
    >
      <span className="opacity-0 group-hover:opacity-100 pointer-events-none absolute left-1.5 top-1 text-[10px] font-mono text-[var(--text-3)] tnum">
        + {timeStr}
      </span>
    </div>
  );
}

function DraggableTimeGridTaskBlock({
  task,
  topPx,
  heightPx,
  leftPct,
  widthPct,
  detailed,
}: {
  task: Task;
  topPx: number;
  heightPx: number;
  leftPct: number;
  widthPct: number;
  detailed: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `caltask_${task.id}`,
    data: { task },
  });
  const setSelectedTaskId = useCadenceStore((s) => s.setSelectedTaskId);
  const shouldIgnoreClickAfterDrag = useCadenceStore(
    (s) => s.shouldIgnoreClickAfterDrag
  );
  const meta = PRIORITY_META[task.priority];

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        if (shouldIgnoreClickAfterDrag()) return;
        setSelectedTaskId(task.id);
      }}
      style={{
        top: topPx,
        height: Math.max(28, heightPx - 2),
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
        opacity: isDragging ? 0.35 : 1,
        backgroundColor: 'var(--popover)',
        borderColor: meta.color,
      }}
      className="absolute z-10 rounded-xl border-2 px-2.5 py-1.5 shadow-sm overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none flex flex-col justify-between"
    >
      <div className="flex items-start justify-between gap-1 min-w-0">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-[var(--text-1)] truncate">
            {task.title}
          </div>
          <div className="text-[10px] text-[var(--text-3)] tnum truncate whitespace-nowrap">
            {formatTime12h(task.due_time)}
            {task.estimated_minutes ? ` · ${task.estimated_minutes}m` : ''}
          </div>
        </div>
        {detailed && <PriorityBadge priority={task.priority} short />}
      </div>
      {detailed && (
        <div className="flex items-center gap-2 pt-1">
          <WorkspaceDot workspace={task.workspace} showLabel />
        </div>
      )}
    </div>
  );
}

export function CalendarView() {
  const filteredTasks = useFilteredTasks();
  const events = useCadenceStore((s) => s.events);
  const calendarMode = useCadenceStore((s) => s.calendarMode);
  const setCalendarMode = useCadenceStore((s) => s.setCalendarMode);
  const calendarDate = useCadenceStore((s) => s.calendarDate);
  const setCalendarDate = useCadenceStore((s) => s.setCalendarDate);
  const patchTask = useCadenceStore((s) => s.patchTask);
  const recordDragEnd = useCadenceStore((s) => s.recordDragEnd);
  const setSelectedEvent = useCadenceStore((s) => s.setSelectedEvent);
  const openComposer = useCadenceStore((s) => s.openComposer);

  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const today = getTodayStr();
  const tzLabel = useMemo(() => getLocalTimezoneLabel(), []);

  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Auto-scroll to current hour when switching to Week or Day mode
  useEffect(() => {
    if (calendarMode === 'month') return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const nowHour = new Date().getHours();
    const targetHour = Math.max(START_HOUR, Math.min(END_HOUR - 2, nowHour - 1));
    el.scrollTop = (targetHour - START_HOUR) * HOUR_HEIGHT;
  }, [calendarMode]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const { setNodeRef: setBacklogRef, isOver: isBacklogOver } = useDroppable({
    id: 'backlog_tray',
    data: { type: 'backlog' },
  });

  // Navigation Prev / Next respecting mode
  const handleNavigate = (dir: -1 | 1) => {
    if (calendarMode === 'month') {
      setCalendarDate(addMonthsStr(calendarDate, dir));
    } else if (calendarMode === 'week') {
      setCalendarDate(addDaysStr(calendarDate, dir * 7));
    } else {
      setCalendarDate(addDaysStr(calendarDate, dir));
    }
  };

  const monthDates = useMemo(() => getMonthGridDates(calendarDate), [calendarDate]);
  const weekMonday = useMemo(
    () => getStartOfWeekMonday(calendarDate),
    [calendarDate]
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysStr(weekMonday, i)),
    [weekMonday]
  );

  // Visible columns for time grid:
  // In Day mode -> [calendarDate]
  // In Week mode -> 7 columns on desktop, 1 column (selected day from week strip) on mobile!
  const timeGridDays = useMemo(() => {
    if (calendarMode === 'day') return [calendarDate];
    if (isMobileViewport) return [calendarDate];
    return weekDays;
  }, [calendarMode, isMobileViewport, calendarDate, weekDays]);

  const visibleRangeDates = useMemo(() => {
    if (calendarMode === 'month') return new Set(monthDates);
    if (calendarMode === 'week') return new Set(weekDays);
    return new Set([calendarDate]);
  }, [calendarMode, monthDates, weekDays, calendarDate]);

  const visibleEventsCount = useMemo(
    () => events.filter((e) => visibleRangeDates.has(e.date)).length,
    [events, visibleRangeDates]
  );

  const visibleTasksCount = useMemo(
    () =>
      filteredTasks.filter((t) => t.due_date && visibleRangeDates.has(t.due_date))
        .length,
    [filteredTasks, visibleRangeDates]
  );

  const unscheduledBacklog = useMemo(
    () =>
      filteredTasks.filter(
        (t) => t.status !== 'done' && (!t.due_date || !t.due_time)
      ),
    [filteredTasks]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task | undefined;
    if (task) setActiveDragTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    recordDragEnd();
    setActiveDragTask(null);
    const { active, over } = event;
    if (!over) return;

    const task = active.data.current?.task as Task | undefined;
    if (!task) return;

    const overData = over.data.current;
    if (!overData) return;

    if (overData.type === 'backlog') {
      patchTask(task.id, { due_time: null });
    } else if (overData.type === 'month_day') {
      patchTask(task.id, { due_date: overData.date });
    } else if (overData.type === 'all_day') {
      patchTask(task.id, { due_date: overData.date, due_time: null });
    } else if (overData.type === 'time_slot') {
      patchTask(task.id, {
        due_date: overData.date,
        due_time: overData.time,
        estimated_minutes: task.estimated_minutes || 45,
      });
    }
  };

  const currentMonthIndex = parseLocalDate(calendarDate).getMonth();
  const headerRangeLabel = useMemo(() => {
    const d = parseLocalDate(calendarDate);
    if (calendarMode === 'day') {
      return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [calendarDate, calendarMode]);

  // Current time indicator calculation
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowTopPx =
    nowMinutes >= START_HOUR * 60 && nowMinutes <= END_HOUR * 60
      ? ((nowMinutes - START_HOUR * 60) / 60) * HOUR_HEIGHT
      : null;

  return (
    <div className="space-y-4">
      <GlobalFilterBar matchCount={filteredTasks.length} />

      {/* Calendar Toolbar */}
      <div className="card p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="inline-flex items-center rounded-xl bg-[var(--surface-1)] border border-[var(--border)] p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => handleNavigate(-1)}
              aria-label="Previous period"
              className="p-2 rounded-lg hover:bg-[var(--surface-3)] text-[var(--text-2)] min-w-[36px] min-h-[36px] inline-flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCalendarDate(today)}
              className="px-2.5 py-1 text-xs font-semibold text-[var(--text-1)] hover:bg-[var(--surface-3)] rounded-lg min-h-[36px]"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleNavigate(1)}
              aria-label="Next period"
              className="p-2 rounded-lg hover:bg-[var(--surface-3)] text-[var(--text-2)] min-w-[36px] min-h-[36px] inline-flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <h2 className="font-display text-sm sm:text-base font-bold text-[var(--text-1)] truncate">
            {headerRangeLabel}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Synced Event & Task counts for visible range */}
          <span className="text-xs text-[var(--text-3)] tnum hidden sm:inline">
            {visibleEventsCount} events · {visibleTasksCount} tasks in range
          </span>

          <SegmentedControl<CalendarMode>
            size="sm"
            ariaLabel="Calendar view mode"
            value={calendarMode}
            onChange={setCalendarMode}
            options={[
              { value: 'month', label: 'Month' },
              { value: 'week', label: 'Week' },
              { value: 'day', label: 'Day' },
            ]}
          />
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-col lg:flex-row gap-4 items-stretch min-w-0">
          {/* UNSCHEDULED BACKLOG TRAY (left on desktop, horizontal scroller on mobile) */}
          <div
            ref={setBacklogRef}
            className={`card p-3.5 lg:w-64 shrink-0 flex flex-col gap-2.5 transition ${
              isBacklogOver
                ? 'ring-2 ring-[var(--accent)] bg-[var(--accent-soft)]'
                : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-xs font-bold text-[var(--text-1)]">
                  Unscheduled Backlog
                </h3>
                <p className="text-[11px] text-[var(--text-3)]">
                  Drag onto calendar or drop here to unschedule time
                </p>
              </div>
              <span className="text-xs font-semibold text-[var(--text-3)] tnum">
                {unscheduledBacklog.length}
              </span>
            </div>

            {unscheduledBacklog.length === 0 ? (
              <div className="py-4 text-center text-xs text-[var(--text-4)]">
                All open tasks have a scheduled time block.
              </div>
            ) : (
              <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto lg:max-h-[560px] py-1">
                {unscheduledBacklog.map((tk) => (
                  <div key={tk.id} className="min-w-[190px] lg:min-w-0 shrink-0">
                    <DraggableTaskChip task={tk} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MAIN CALENDAR CANVAS */}
          <div className="flex-1 min-w-0 card overflow-hidden">
            {/* 1. MONTH MODE */}
            {calendarMode === 'month' && (
              <div>
                {/* Desktop Month Grid (>=768px) */}
                <div className="hidden md:block">
                  <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--surface-1)]">
                    {WEEKDAY_SHORT.map((wd) => (
                      <div
                        key={wd}
                        className="py-2 text-center text-xs font-semibold text-[var(--text-3)]"
                      >
                        {wd}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {monthDates.map((dStr) => {
                      const dMonth = parseLocalDate(dStr).getMonth();
                      const dayEvents = events.filter((e) => e.date === dStr);
                      const dayTasks = filteredTasks.filter(
                        (t) => t.due_date === dStr
                      );
                      return (
                        <DroppableMonthCell
                          key={dStr}
                          dateStr={dStr}
                          isCurrentMonth={dMonth === currentMonthIndex}
                          isToday={dStr === today}
                          isSelected={dStr === calendarDate}
                          events={dayEvents}
                          tasks={dayTasks}
                          onSelectDate={setCalendarDate}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Mobile Compact Month Grid + Selected Day Agenda (<768px) */}
                <div className="md:hidden p-3 space-y-4">
                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-[var(--text-3)]">
                    {WEEKDAY_SHORT.map((w) => (
                      <div key={w}>{w.slice(0, 2)}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {monthDates.map((dStr) => {
                      const dMonth = parseLocalDate(dStr).getMonth();
                      const hasItems =
                        events.some((e) => e.date === dStr) ||
                        filteredTasks.some((t) => t.due_date === dStr);
                      const isSel = dStr === calendarDate;
                      const isTd = dStr === today;
                      return (
                        <button
                          key={dStr}
                          type="button"
                          onClick={() => setCalendarDate(dStr)}
                          className={`min-h-[42px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-xs font-semibold tnum transition ${
                            !dMonth ? 'opacity-40' : ''
                          } ${
                            isSel
                              ? 'bg-[var(--accent)] text-white'
                              : isTd
                              ? 'border border-[var(--accent)] text-[var(--accent)]'
                              : 'text-[var(--text-1)] hover:bg-[var(--surface-3)]'
                          }`}
                        >
                          <span>{Number(dStr.slice(8, 10))}</span>
                          {hasItems && (
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isSel ? 'bg-white' : 'bg-[var(--accent)]'
                              }`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Agenda for selected date (selecting date stays in Month mode; explicit Day view button provided) */}
                  <div className="pt-3 border-t border-[var(--border)] space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold text-[var(--text-1)]">
                        Agenda · {formatHumanDate(calendarDate, today)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCalendarMode('day')}
                          className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs font-semibold min-h-[34px]"
                        >
                          Day view
                        </button>
                        <button
                          type="button"
                          onClick={() => openComposer({ due_date: calendarDate })}
                          className="btn-accent px-2.5 py-1.5 rounded-lg text-xs font-semibold min-h-[34px]"
                        >
                          + Task
                        </button>
                      </div>
                    </div>

                    {events
                      .filter((e) => e.date === calendarDate)
                      .map((ev) => (
                        <div
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="p-2.5 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] flex items-center justify-between text-xs cursor-pointer"
                        >
                          <span className="font-semibold text-[var(--text-1)] truncate">
                            {ev.title}
                          </span>
                          <span className="text-[11px] text-[var(--text-3)] tnum shrink-0 ml-2">
                            {ev.start_time} – {ev.end_time}
                          </span>
                        </div>
                      ))}

                    {filteredTasks
                      .filter((t) => t.due_date === calendarDate)
                      .map((tk) => (
                        <DraggableTaskChip key={tk.id} task={tk} />
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* 2. WEEK & DAY TIME GRID MODES */}
            {(calendarMode === 'week' || calendarMode === 'day') && (
              <div>
                {/* Mobile selectable week strip when in Week mode */}
                {calendarMode === 'week' && isMobileViewport && (
                  <div className="grid grid-cols-7 gap-1 p-2 border-b border-[var(--border)] bg-[var(--surface-1)]">
                    {weekDays.map((dStr, idx) => {
                      const active = dStr === calendarDate;
                      return (
                        <button
                          key={dStr}
                          type="button"
                          onClick={() => setCalendarDate(dStr)}
                          className={`py-1.5 rounded-xl flex flex-col items-center text-[11px] font-semibold tnum ${
                            active
                              ? 'bg-[var(--accent)] text-white'
                              : 'text-[var(--text-2)]'
                          }`}
                        >
                          <span>{WEEKDAY_SHORT[idx].slice(0, 2)}</span>
                          <span>{Number(dStr.slice(8, 10))}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Column Header Row with Local Timezone Label */}
                <div className="flex border-b border-[var(--border)] bg-[var(--surface-1)]">
                  <div className="w-16 shrink-0 p-2 text-[10px] font-mono font-semibold text-[var(--text-3)] flex items-center justify-center border-r border-[var(--border)]">
                    {tzLabel}
                  </div>
                  <div
                    className="flex-1 grid"
                    style={{
                      gridTemplateColumns: `repeat(${timeGridDays.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {timeGridDays.map((dStr) => {
                      const d = parseLocalDate(dStr);
                      const isTd = dStr === today;
                      return (
                        <div
                          key={dStr}
                          onClick={() => setCalendarDate(dStr)}
                          className="py-2 px-2 text-center border-l first:border-l-0 border-[var(--border)] cursor-pointer"
                        >
                          <div className="text-[11px] font-medium text-[var(--text-3)]">
                            {d.toLocaleDateString('en-US', { weekday: 'short' })}
                          </div>
                          <div
                            className={`mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold tnum ${
                              isTd
                                ? 'bg-[var(--accent)] text-white'
                                : 'text-[var(--text-1)]'
                            }`}
                          >
                            {d.getDate()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* All-Day Row for Tasks without a time */}
                <div className="flex border-b border-[var(--border)] bg-[var(--surface-2)]">
                  <div className="w-16 shrink-0 p-2 text-[10px] font-medium text-[var(--text-3)] flex items-center justify-center border-r border-[var(--border)]">
                    All-day
                  </div>
                  <div
                    className="flex-1 grid"
                    style={{
                      gridTemplateColumns: `repeat(${timeGridDays.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {timeGridDays.map((dStr) => {
                      const allDayTasks = filteredTasks.filter(
                        (t) => t.due_date === dStr && !t.due_time
                      );
                      return (
                        <DroppableAllDayCell
                          key={dStr}
                          dateStr={dStr}
                          tasks={allDayTasks}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Scrollable 06:00 - 22:00 Time Grid (68px/hr, 30-min drop zones) */}
                <div
                  ref={scrollContainerRef}
                  className="max-h-[620px] overflow-y-auto relative flex"
                >
                  {/* Hour Labels Gutter */}
                  <div className="w-16 shrink-0 border-r border-[var(--border)] bg-[var(--surface-1)] select-none">
                    {HOURS.map((hr) => (
                      <div
                        key={hr}
                        style={{ height: HOUR_HEIGHT }}
                        className="pr-2 pt-1 text-right text-[11px] font-mono text-[var(--text-3)] tnum"
                      >
                        {`${String(hr).padStart(2, '0')}:00`}
                      </div>
                    ))}
                  </div>

                  {/* Columns Container */}
                  <div
                    className="flex-1 grid relative"
                    style={{
                      gridTemplateColumns: `repeat(${timeGridDays.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {timeGridDays.map((dStr) => {
                      const dayEvents = events.filter((e) => e.date === dStr);
                      const dayTimedTasks = filteredTasks.filter(
                        (t) => t.due_date === dStr && Boolean(t.due_time)
                      );

                      type GridEntry =
                        | { type: 'event'; event: CalendarEvent }
                        | { type: 'task'; task: Task };

                      const rawClusterInput: {
                        item: GridEntry;
                        startMin: number;
                        endMin: number;
                      }[] = [
                        ...dayEvents.map((ev) => ({
                          item: { type: 'event' as const, event: ev },
                          startMin: timeToMinutes(ev.start_time),
                          endMin: Math.max(
                            timeToMinutes(ev.start_time) + 30,
                            timeToMinutes(ev.end_time)
                          ),
                        })),
                        ...dayTimedTasks.map((tk) => {
                          const st = timeToMinutes(tk.due_time || '09:00');
                          return {
                            item: { type: 'task' as const, task: tk },
                            startMin: st,
                            endMin: st + (tk.estimated_minutes || 45),
                          };
                        }),
                      ];

                      const positioned = layoutCollisionClusters(rawClusterInput);

                      return (
                        <div
                          key={dStr}
                          className="relative border-l first:border-l-0 border-[var(--border)]"
                        >
                          {/* 30-Minute Drop Zones */}
                          {HOURS.map((hr) => {
                            const hPad = String(hr).padStart(2, '0');
                            return (
                              <div key={hr}>
                                <HalfHourSlot
                                  dateStr={dStr}
                                  timeStr={`${hPad}:00`}
                                />
                                <HalfHourSlot
                                  dateStr={dStr}
                                  timeStr={`${hPad}:30`}
                                />
                              </div>
                            );
                          })}

                          {/* Current Time Line Indicator */}
                          {dStr === today && nowTopPx !== null && (
                            <div
                              style={{ top: nowTopPx }}
                              className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                            >
                              <span className="w-2.5 h-2.5 rounded-full bg-[#F43F5E] -ml-1.5" />
                              <div className="h-[2px] w-full bg-[#F43F5E]" />
                            </div>
                          )}

                          {/* Positioned Events & Tasks per Collision Cluster */}
                          {positioned.map((pos, idx) => {
                            const topPx =
                              ((pos.startMin - START_HOUR * 60) / 60) * HOUR_HEIGHT;
                            const heightPx =
                              ((pos.endMin - pos.startMin) / 60) * HOUR_HEIGHT;
                            if (topPx < 0) return null;

                            const widthPct = 100 / pos.colCount;
                            const leftPct = pos.colIndex * widthPct;

                            if (pos.item.type === 'event') {
                              const ev = pos.item.event;
                              const color = ev.color || '#4F46E5';
                              return (
                                <div
                                  key={`ev_${ev.id}_${idx}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEvent(ev);
                                  }}
                                  style={{
                                    top: topPx,
                                    height: Math.max(28, heightPx - 2),
                                    left: `calc(${leftPct}% + 2px)`,
                                    width: `calc(${widthPct}% - 4px)`,
                                    backgroundColor: `${color}1A`,
                                    borderColor: color,
                                  }}
                                  className="absolute z-10 rounded-xl border px-2.5 py-1.5 overflow-hidden cursor-pointer hover:brightness-105 transition flex flex-col justify-between"
                                >
                                  <div className="min-w-0">
                                    <div className="text-[11px] font-bold text-[var(--text-1)] truncate">
                                      {ev.title}
                                    </div>
                                    <div className="text-[10px] text-[var(--text-2)] tnum truncate whitespace-nowrap">
                                      {formatTime12h(ev.start_time)} –{' '}
                                      {formatTime12h(ev.end_time)}
                                    </div>
                                    {calendarMode === 'day' && ev.location && (
                                      <div className="text-[10px] text-[var(--text-3)] inline-flex items-center gap-1 mt-0.5">
                                        <MapPin className="w-3 h-3" />
                                        <span>{ev.location}</span>
                                      </div>
                                    )}
                                  </div>
                                  {ev.meet_link && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)]">
                                      <Video className="w-3 h-3" />
                                      <span>Google Meet</span>
                                    </span>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <DraggableTimeGridTaskBlock
                                key={`tk_${pos.item.task.id}`}
                                task={pos.item.task}
                                topPx={topPx}
                                heightPx={heightPx}
                                leftPct={leftPct}
                                widthPct={widthPct}
                                detailed={calendarMode === 'day'}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeDragTask && (
            <div className="popover-surface px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-1)] shadow-xl">
              {activeDragTask.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
