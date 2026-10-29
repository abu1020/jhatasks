import React, { useMemo, useState } from 'react';
import { Check, ListTodo, Plus } from 'lucide-react';
import {
  PRIORITY_META,
  STATUS_META,
  type PriorityLevel,
  type Task,
  type TaskStatus,
} from '../../db/schema';
import { formatHumanDate, getTodayStr } from '../../lib/dateUtils';
import {
  useCadenceStore,
  type ListGroupBy,
  type ListSortBy,
} from '../../store/useCadenceStore';
import { GlobalFilterBar, useFilteredTasks } from '../ui/FilterBar';
import {
  CustomSelect,
  EmptyState,
  PriorityBadge,
  TagChip,
  WorkspaceDot,
  type SelectOption,
} from '../ui/Primitives';
import { EcosystemSyncToolbar } from '../ui/EcosystemSyncToolbar';

const GROUP_OPTIONS: SelectOption<ListGroupBy>[] = [
  { value: 'priority', label: 'Group: Priority' },
  { value: 'due_date', label: 'Group: Due Date' },
  { value: 'status', label: 'Group: Status' },
];

const SORT_OPTIONS: SelectOption<ListSortBy>[] = [
  { value: 'priority', label: 'Sort: Priority' },
  { value: 'due_date', label: 'Sort: Due Date' },
  { value: 'title', label: 'Sort: Title' },
  { value: 'newest', label: 'Sort: Newest' },
];

const STATUS_SELECT_OPTIONS: SelectOption<TaskStatus>[] = [
  { value: 'todo', label: 'To Do', dotColor: STATUS_META.todo.color },
  { value: 'in_progress', label: 'In Progress', dotColor: STATUS_META.in_progress.color },
  { value: 'in_review', label: 'In Review', dotColor: STATUS_META.in_review.color },
  { value: 'done', label: 'Done', dotColor: STATUS_META.done.color },
];

function ListRow({ task }: { task: Task }) {
  const patchTask = useCadenceStore((s) => s.patchTask);
  const toggleTaskDone = useCadenceStore((s) => s.toggleTaskDone);
  const setSelectedTaskId = useCadenceStore((s) => s.setSelectedTaskId);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);

  const done = task.status === 'done';

  const commitInlineTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim() || 'Untitled task';
    setTitleDraft(trimmed);
    if (trimmed !== task.title) {
      patchTask(task.id, { title: trimmed });
    }
  };

  const cyclePriority = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = ((task.priority % 4) + 1) as PriorityLevel;
    patchTask(task.id, { priority: next });
  };

  return (
    <div
      onClick={() => {
        if (!editingTitle) setSelectedTaskId(task.id);
      }}
      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 px-3.5 py-2.5 hover:bg-[var(--surface-1)] transition cursor-pointer"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleTaskDone(task.id, { x: e.clientX, y: e.clientY });
          }}
          aria-label={
            done ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`
          }
          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
            done
              ? 'bg-[#10B981] border-[#10B981] text-white'
              : 'border-[var(--border-strong)] hover:border-[var(--accent)]'
          }`}
        >
          {done && <Check className="w-3.5 h-3.5" />}
        </button>

        {editingTitle ? (
          <input
            type="text"
            autoFocus
            value={titleDraft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitInlineTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitInlineTitle();
              if (e.key === 'Escape') {
                setTitleDraft(task.title);
                setEditingTitle(false);
              }
            }}
            className="input-base px-2.5 py-1 rounded-lg text-xs font-semibold flex-1 min-w-[140px]"
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setTitleDraft(task.title);
              setEditingTitle(true);
            }}
            title="Double-click to inline edit title"
            className="min-w-0 flex-1"
          >
            <div
              className={`text-xs font-semibold truncate ${
                done ? 'line-through text-[var(--text-3)]' : 'text-[var(--text-1)]'
              }`}
            >
              {task.title}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <WorkspaceDot workspace={task.workspace} showLabel />
              {task.tags.map((tg) => (
                <TagChip key={tg} tag={tg} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Inline Controls: Priority cycle chip, Date input, Status combobox */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 shrink-0 ml-8 sm:ml-0"
      >
        <PriorityBadge priority={task.priority} short onClick={cyclePriority} />

        <input
          type="date"
          aria-label={`Due date for ${task.title}`}
          value={task.due_date || ''}
          onChange={(e) =>
            patchTask(task.id, { due_date: e.target.value || null })
          }
          className="input-base px-2 py-1 rounded-lg text-[11px] tnum w-[118px] min-h-[34px]"
        />

        <CustomSelect
          size="sm"
          ariaLabel={`Status for ${task.title}`}
          value={task.status}
          onChange={(nextStatus) => patchTask(task.id, { status: nextStatus })}
          options={STATUS_SELECT_OPTIONS}
        />
      </div>
    </div>
  );
}

export function ListView() {
  const filteredTasks = useFilteredTasks();
  const listGroupBy = useCadenceStore((s) => s.listGroupBy);
  const setListGroupBy = useCadenceStore((s) => s.setListGroupBy);
  const listSortBy = useCadenceStore((s) => s.listSortBy);
  const setListSortBy = useCadenceStore((s) => s.setListSortBy);
  const openComposer = useCadenceStore((s) => s.openComposer);

  const today = getTodayStr();

  const completedTotal = useMemo(
    () => filteredTasks.filter((t) => t.status === 'done').length,
    [filteredTasks]
  );

  const groups = useMemo(() => {
    const sortTasks = (arr: Task[]) =>
      [...arr].sort((a, b) => {
        // Completed always sink within group
        if (a.status === 'done' && b.status !== 'done') return 1;
        if (a.status !== 'done' && b.status === 'done') return -1;

        if (listSortBy === 'priority') {
          return a.priority - b.priority || a.sort_order - b.sort_order;
        }
        if (listSortBy === 'due_date') {
          return (a.due_date || '9999-99-99').localeCompare(
            b.due_date || '9999-99-99'
          );
        }
        if (listSortBy === 'title') {
          return a.title.localeCompare(b.title);
        }
        return b.created_at.localeCompare(a.created_at);
      });

    if (listGroupBy === 'priority') {
      return ([1, 2, 3, 4] as PriorityLevel[]).map((lvl) => ({
        key: `prio_${lvl}`,
        label: PRIORITY_META[lvl].label,
        color: PRIORITY_META[lvl].color,
        items: sortTasks(filteredTasks.filter((t) => t.priority === lvl)),
      }));
    }

    if (listGroupBy === 'status') {
      return (['todo', 'in_progress', 'in_review', 'done'] as TaskStatus[]).map(
        (st) => ({
          key: `status_${st}`,
          label: STATUS_META[st].label,
          color: STATUS_META[st].color,
          items: sortTasks(filteredTasks.filter((t) => t.status === st)),
        })
      );
    }

    // Group by due_date
    const buckets: Record<string, Task[]> = {
      Overdue: [],
      Today: [],
      Upcoming: [],
      'No Date': [],
    };
    for (const t of filteredTasks) {
      if (!t.due_date) buckets['No Date'].push(t);
      else if (t.due_date < today) buckets.Overdue.push(t);
      else if (t.due_date === today) buckets.Today.push(t);
      else buckets.Upcoming.push(t);
    }
    return [
      { key: 'overdue', label: 'Overdue', color: '#F43F5E', items: sortTasks(buckets.Overdue) },
      { key: 'today', label: 'Today', color: '#4F46E5', items: sortTasks(buckets.Today) },
      { key: 'upcoming', label: 'Upcoming', color: '#06B6D4', items: sortTasks(buckets.Upcoming) },
      { key: 'nodate', label: 'No Date', color: '#64748B', items: sortTasks(buckets['No Date']) },
    ];
  }, [filteredTasks, listGroupBy, listSortBy, today]);

  return (
    <div className="space-y-4">
      <EcosystemSyncToolbar />
      <GlobalFilterBar matchCount={filteredTasks.length} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CustomSelect
            size="sm"
            ariaLabel="Group tasks by"
            value={listGroupBy}
            onChange={setListGroupBy}
            options={GROUP_OPTIONS}
          />
          <CustomSelect
            size="sm"
            ariaLabel="Sort tasks by"
            value={listSortBy}
            onChange={setListSortBy}
            options={SORT_OPTIONS}
          />
          <span className="text-xs text-[var(--text-3)] tnum px-2">
            {completedTotal} completed
          </span>
        </div>

        <button
          type="button"
          onClick={() => openComposer()}
          className="btn-accent px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 min-h-[38px]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add task</span>
        </button>
      </div>

      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={<ListTodo className="w-6 h-6" />}
          title="No tasks in this list view"
          description="Double-click any task row to edit titles inline, or click priority badges to cycle urgency."
          actionLabel="Add task"
          onAction={() => openComposer()}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((grp) => {
            if (grp.items.length === 0) return null;
            const grpCompleted = grp.items.filter((i) => i.status === 'done').length;
            return (
              <div key={grp.key} className="card overflow-hidden">
                <div className="px-4 py-2.5 bg-[var(--surface-1)] border-b border-[var(--border)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: grp.color }}
                    />
                    <h3 className="font-display text-xs font-bold text-[var(--text-1)]">
                      {grp.label}
                    </h3>
                    <span className="text-xs text-[var(--text-3)] tnum">
                      ({grp.items.length})
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--text-3)] tnum">
                    {grpCompleted} done
                  </span>
                </div>

                <div className="divide-y divide-[var(--border)]">
                  {grp.items.map((task) => (
                    <ListRow key={task.id} task={task} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
