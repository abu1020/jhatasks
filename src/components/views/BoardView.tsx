import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, Clock, GripVertical, Kanban, Play, Plus } from 'lucide-react';
import { STATUS_META, type Task, type TaskStatus } from '../../db/schema';
import { computeMidpointSortOrder, formatHumanDate } from '../../lib/dateUtils';
import { useCadenceStore } from '../../store/useCadenceStore';
import { GlobalFilterBar, useFilteredTasks } from '../ui/FilterBar';
import {
  EmptyState,
  PriorityBadge,
  ProgressBar,
  TagChip,
  WorkspaceDot,
} from '../ui/Primitives';

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

function SortableBoardCard({ task }: { task: Task }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: 'task', task },
  });

  const setSelectedTaskId = useCadenceStore((s) => s.setSelectedTaskId);
  const shouldIgnoreClickAfterDrag = useCadenceStore(
    (s) => s.shouldIgnoreClickAfterDrag
  );
  const toggleTaskDone = useCadenceStore((s) => s.toggleTaskDone);
  const startFocusTimer = useCadenceStore((s) => s.startFocusTimer);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const done = task.status === 'done';
  const subtasksDone = task.subtasks.filter((s) => s.done).length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => {
        if (shouldIgnoreClickAfterDrag()) return;
        setSelectedTaskId(task.id);
      }}
      className="card p-3.5 space-y-2.5 cursor-pointer hover:border-[var(--border-strong)] transition group select-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTaskDone(task.id, { x: e.clientX, y: e.clientY });
            }}
            aria-label={
              done ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`
            }
            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
              done
                ? 'bg-[#10B981] border-[#10B981] text-white'
                : 'border-[var(--border-strong)] hover:border-[var(--accent)]'
            }`}
          >
            {done && <Check className="w-3 h-3" />}
          </button>
          <span
            className={`text-xs font-semibold leading-snug break-words ${
              done ? 'line-through text-[var(--text-3)]' : 'text-[var(--text-1)]'
            }`}
          >
            {task.title}
          </span>
        </div>

        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Drag ${task.title}`}
          className="text-[var(--text-4)] hover:text-[var(--text-2)] p-1 -mr-1 -mt-1 cursor-grab active:cursor-grabbing touch-none shrink-0"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tags & Subtasks */}
      {(task.tags.length > 0 || task.subtasks.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {task.tags.slice(0, 3).map((tg) => (
            <TagChip key={tg} tag={tg} />
          ))}
          {task.subtasks.length > 0 && (
            <span className="text-[11px] text-[var(--text-3)] tnum">
              {subtasksDone}/{task.subtasks.length} subtasks
            </span>
          )}
        </div>
      )}

      {/* Bottom metadata row */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border)] text-[11px] text-[var(--text-3)]">
        <div className="flex items-center gap-2 min-w-0">
          <WorkspaceDot workspace={task.workspace} />
          <PriorityBadge priority={task.priority} short />
          {task.due_date && (
            <span className="inline-flex items-center gap-1 tnum truncate">
              <Clock className="w-3 h-3 shrink-0" />
              <span>{formatHumanDate(task.due_date)}</span>
            </span>
          )}
        </div>

        {!done && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startFocusTimer(task.id, 'focus');
            }}
            aria-label={`Start focus timer for ${task.title}`}
            className="p-1 rounded-md hover:bg-[var(--surface-3)] text-[var(--accent)]"
          >
            <Play className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  status,
  tasks,
}: {
  status: TaskStatus;
  tasks: Task[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col_${status}`,
    data: { type: 'column', status },
  });

  const wipLimits = useCadenceStore((s) => s.wipLimits);
  const shakingColumn = useCadenceStore((s) => s.shakingColumn);
  const openComposer = useCadenceStore((s) => s.openComposer);

  const meta = STATUS_META[status];
  const limit = wipLimits[status] || 10;
  const overWip = status !== 'done' && tasks.length > limit;
  const isShaking = shakingColumn === status;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-2xl bg-[var(--surface-1)] border p-3 min-h-[420px] transition ${
        isOver
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-[var(--border)]'
      } ${isShaking ? 'animate-shake' : ''}`}
    >
      {/* Column Header */}
      <div className="space-y-2 mb-3 px-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: meta.color }}
            />
            <h3 className="font-display text-xs font-bold text-[var(--text-1)]">
              {meta.label}
            </h3>
          </div>
          <span
            className={`text-xs font-semibold tnum px-2 py-0.5 rounded-md ${
              overWip
                ? 'bg-[#F59E0B]/15 text-[#F59E0B]'
                : 'text-[var(--text-3)] bg-[var(--surface-2)]'
            }`}
          >
            {status === 'done' ? tasks.length : `${tasks.length}/${limit}`}
          </span>
        </div>

        <ProgressBar
          value={tasks.length}
          max={status === 'done' ? Math.max(tasks.length, 5) : limit}
          color={overWip ? '#F59E0B' : meta.color}
          height={4}
        />
      </div>

      {/* Cards */}
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 space-y-2.5">
          {tasks.map((task) => (
            <SortableBoardCard key={task.id} task={task} />
          ))}
        </div>
      </SortableContext>

      {/* New Card Button preset to this column's status */}
      <button
        type="button"
        onClick={() => openComposer({ status })}
        className="mt-3 w-full py-2 px-3 rounded-xl text-xs font-medium text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-2)] border border-dashed border-[var(--border-strong)] inline-flex items-center justify-center gap-1.5 min-h-[38px] transition"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>New card</span>
      </button>
    </div>
  );
}

export function BoardView() {
  const filteredTasks = useFilteredTasks();
  const allTasks = useCadenceStore((s) => s.tasks);
  const patchTask = useCadenceStore((s) => s.patchTask);
  const wipLimits = useCadenceStore((s) => s.wipLimits);
  const addToast = useCadenceStore((s) => s.addToast);
  const triggerColumnShake = useCadenceStore((s) => s.triggerColumnShake);
  const recordDragEnd = useCadenceStore((s) => s.recordDragEnd);
  const openComposer = useCadenceStore((s) => s.openComposer);

  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const byColumn = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };
    for (const t of filteredTasks) {
      map[t.status]?.push(t);
    }
    for (const col of COLUMNS) {
      map[col].sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [filteredTasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const t = allTasks.find((item) => item.id === String(event.active.id));
    if (t) setActiveTask(t);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    recordDragEnd();
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const draggedId = String(active.id);
    const draggedTask = allTasks.find((t) => t.id === draggedId);
    if (!draggedTask) return;

    const overId = String(over.id);
    let targetStatus: TaskStatus = draggedTask.status;
    let overTaskId: string | null = null;

    if (overId.startsWith('col_')) {
      targetStatus = overId.replace('col_', '') as TaskStatus;
    } else {
      const overTask = allTasks.find((t) => t.id === overId);
      if (overTask) {
        targetStatus = overTask.status;
        overTaskId = overTask.id;
      }
    }

    const colTasks = byColumn[targetStatus].filter((t) => t.id !== draggedId);
    let newSortOrder = draggedTask.sort_order;

    if (!overTaskId) {
      const last = colTasks[colTasks.length - 1];
      newSortOrder = computeMidpointSortOrder(last ? last.sort_order : null, null);
    } else {
      const idx = colTasks.findIndex((t) => t.id === overTaskId);
      if (idx <= 0) {
        const first = colTasks[0];
        newSortOrder = computeMidpointSortOrder(null, first ? first.sort_order : null);
      } else {
        const prev = colTasks[idx - 1];
        const next = colTasks[idx];
        newSortOrder = computeMidpointSortOrder(prev.sort_order, next.sort_order);
      }
    }

    // Advisory WIP check: warn + shake, ALWAYS allow the drop
    if (
      targetStatus !== draggedTask.status &&
      targetStatus !== 'done' &&
      colTasks.length + 1 > (wipLimits[targetStatus] || 10)
    ) {
      triggerColumnShake(targetStatus);
      addToast({
        message: `Advisory WIP limit (${wipLimits[targetStatus]}) exceeded in ${STATUS_META[targetStatus].label}`,
        tone: 'warning',
      });
    }

    patchTask(draggedId, {
      status: targetStatus,
      sort_order: newSortOrder,
    });
  };

  return (
    <div>
      <GlobalFilterBar matchCount={filteredTasks.length} />

      {allTasks.length === 0 && (
        <EmptyState
          icon={<Kanban className="w-6 h-6" />}
          title="Your Kanban board is ready"
          description="Organize work across To Do, In Progress, In Review, and Done with fractional drag-and-drop ordering."
          actionLabel="Create first card"
          onAction={() => openComposer({ status: 'todo' })}
        />
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {COLUMNS.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={byColumn[status]}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="card p-3.5 shadow-xl border-[var(--accent)] opacity-95 w-[260px]">
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
