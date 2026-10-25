import React, { useMemo, useState } from 'react';
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
import { Check, GripVertical, Grid2X2, Plus } from 'lucide-react';
import type { PriorityLevel, QuadrantType, Task } from '../../db/schema';
import { deriveQuadrant, formatHumanDate, getTodayStr } from '../../lib/dateUtils';
import { useCadenceStore } from '../../store/useCadenceStore';
import { GlobalFilterBar, useFilteredTasks } from '../ui/FilterBar';
import { EmptyState, PriorityBadge, WorkspaceDot } from '../ui/Primitives';

const QUADRANTS: {
  id: QuadrantType;
  title: string;
  subtitle: string;
  color: string;
  defaultPriority: PriorityLevel;
  defaultImportant: boolean;
}[] = [
  {
    id: 'do',
    title: 'Do First',
    subtitle: 'Urgent & Important — Execute immediately',
    color: '#F43F5E',
    defaultPriority: 1,
    defaultImportant: true,
  },
  {
    id: 'schedule',
    title: 'Schedule',
    subtitle: 'Important, Not Urgent — Plan dedicated focus time',
    color: '#4F46E5',
    defaultPriority: 2,
    defaultImportant: true,
  },
  {
    id: 'delegate',
    title: 'Delegate',
    subtitle: 'Urgent, Less Important — Streamline or hand off',
    color: '#F59E0B',
    defaultPriority: 3,
    defaultImportant: false,
  },
  {
    id: 'eliminate',
    title: 'Eliminate / Later',
    subtitle: 'Neither Urgent nor Critical — Minimize or defer',
    color: '#64748B',
    defaultPriority: 4,
    defaultImportant: false,
  },
];

function MatrixCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `mtx_${task.id}`,
    data: { task },
  });
  const setSelectedTaskId = useCadenceStore((s) => s.setSelectedTaskId);
  const toggleTaskDone = useCadenceStore((s) => s.toggleTaskDone);
  const shouldIgnoreClickAfterDrag = useCadenceStore(
    (s) => s.shouldIgnoreClickAfterDrag
  );

  const done = task.status === 'done';

  return (
    <div
      ref={setNodeRef}
      onClick={() => {
        if (shouldIgnoreClickAfterDrag()) return;
        setSelectedTaskId(task.id);
      }}
      style={{ opacity: isDragging ? 0.35 : 1 }}
      className="card p-3 flex items-center justify-between gap-2.5 cursor-pointer hover:border-[var(--border-strong)] transition select-none"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleTaskDone(task.id, { x: e.clientX, y: e.clientY });
          }}
          aria-label={
            done ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`
          }
          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
            done
              ? 'bg-[#10B981] border-[#10B981] text-white'
              : 'border-[var(--border-strong)] hover:border-[var(--accent)]'
          }`}
        >
          {done && <Check className="w-3 h-3" />}
        </button>

        <div className="min-w-0">
          <div
            className={`text-xs font-semibold truncate ${
              done ? 'line-through text-[var(--text-3)]' : 'text-[var(--text-1)]'
            }`}
          >
            {task.title}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--text-3)] tnum">
            <WorkspaceDot workspace={task.workspace} />
            <PriorityBadge priority={task.priority} short />
            {task.due_date && <span>· {formatHumanDate(task.due_date)}</span>}
          </div>
        </div>
      </div>

      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Drag ${task.title} to another quadrant`}
        className="text-[var(--text-4)] hover:text-[var(--text-2)] p-1 cursor-grab active:cursor-grabbing touch-none shrink-0"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function QuadrantBox({
  quadrant,
  tasks,
}: {
  quadrant: (typeof QUADRANTS)[number];
  tasks: Task[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `quad_${quadrant.id}`,
    data: { quadrant: quadrant.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl bg-[var(--surface-1)] border p-4 flex flex-col justify-between min-h-[280px] transition ${
        isOver
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-[var(--border)]'
      }`}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: quadrant.color }}
              />
              <h3 className="font-display text-sm font-bold text-[var(--text-1)]">
                {quadrant.title}
              </h3>
            </div>
            <p className="text-[11px] text-[var(--text-3)] mt-0.5">
              {quadrant.subtitle}
            </p>
          </div>
          <span className="text-xs font-bold text-[var(--text-2)] bg-[var(--surface-2)] px-2 py-0.5 rounded-md tnum">
            {tasks.length}
          </span>
        </div>

        <div className="space-y-2">
          {tasks.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-4)]">
              Drop tasks here to assign to {quadrant.title}
            </div>
          ) : (
            tasks.map((tk) => <MatrixCard key={tk.id} task={tk} />)
          )}
        </div>
      </div>
    </div>
  );
}

export function MatrixView() {
  const filteredTasks = useFilteredTasks();
  const patchTask = useCadenceStore((s) => s.patchTask);
  const recordDragEnd = useCadenceStore((s) => s.recordDragEnd);
  const openComposer = useCadenceStore((s) => s.openComposer);

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const today = getTodayStr();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
  );

  const byQuadrant = useMemo(() => {
    const map: Record<QuadrantType, Task[]> = {
      do: [],
      schedule: [],
      delegate: [],
      eliminate: [],
    };
    for (const t of filteredTasks) {
      const q = deriveQuadrant(t, today);
      map[q].push(t);
    }
    return map;
  }, [filteredTasks, today]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task | undefined;
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    recordDragEnd();
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const task = active.data.current?.task as Task | undefined;
    const targetQuadrant = over.data.current?.quadrant as QuadrantType | undefined;
    if (!task || !targetQuadrant) return;

    const qConfig = QUADRANTS.find((q) => q.id === targetQuadrant)!;

    // Persist explicit quadrant so card NEVER bounces back to derived quadrant
    patchTask(task.id, {
      quadrant: targetQuadrant,
      priority: qConfig.defaultPriority,
      important: qConfig.defaultImportant,
    });
  };

  return (
    <div className="space-y-4">
      <GlobalFilterBar matchCount={filteredTasks.length} />

      {filteredTasks.length === 0 && (
        <EmptyState
          icon={<Grid2X2 className="w-6 h-6" />}
          title="Eisenhower Decision Matrix"
          description="Separate Urgent noise from Important outcomes. Drag any task across quadrants to persist its strategic priority."
          actionLabel="Add task to matrix"
          onAction={() => openComposer()}
        />
      )}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {QUADRANTS.map((q) => (
            <QuadrantBox
              key={q.id}
              quadrant={q}
              tasks={byQuadrant[q.id]}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="card p-3 shadow-xl border-[var(--accent)] w-[240px]">
              <div className="text-xs font-semibold text-[var(--text-1)]">
                {activeTask.title}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
