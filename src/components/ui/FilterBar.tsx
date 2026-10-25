import React, { useMemo } from 'react';
import { Eye, EyeOff, Filter, Search, X } from 'lucide-react';
import { PRIORITY_META, type PriorityLevel, type Task } from '../../db/schema';
import { useCadenceStore } from '../../store/useCadenceStore';
import { CustomSelect, type SelectOption } from './Primitives';

export function useFilteredTasks(): Task[] {
  const tasks = useCadenceStore((s) => s.tasks);
  const workspace = useCadenceStore((s) => s.workspace);
  const searchQuery = useCadenceStore((s) => s.searchQuery);
  const priorityFilter = useCadenceStore((s) => s.priorityFilter);
  const tagFilter = useCadenceStore((s) => s.tagFilter);
  const showCompleted = useCadenceStore((s) => s.showCompleted);

  return useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (workspace !== 'all' && t.workspace !== workspace) return false;
      if (!showCompleted && t.status === 'done') return false;
      if (priorityFilter !== null && t.priority !== priorityFilter) return false;
      if (tagFilter && !t.tags.includes(tagFilter)) return false;
      if (q) {
        const hay = `${t.title} ${t.description} ${t.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, workspace, searchQuery, priorityFilter, tagFilter, showCompleted]);
}

export function GlobalFilterBar({ matchCount }: { matchCount: number }) {
  const tasks = useCadenceStore((s) => s.tasks);
  const searchQuery = useCadenceStore((s) => s.searchQuery);
  const setSearchQuery = useCadenceStore((s) => s.setSearchQuery);
  const priorityFilter = useCadenceStore((s) => s.priorityFilter);
  const setPriorityFilter = useCadenceStore((s) => s.setPriorityFilter);
  const tagFilter = useCadenceStore((s) => s.tagFilter);
  const setTagFilter = useCadenceStore((s) => s.setTagFilter);
  const showCompleted = useCadenceStore((s) => s.showCompleted);
  const setShowCompleted = useCadenceStore((s) => s.setShowCompleted);
  const clearFilters = useCadenceStore((s) => s.clearFilters);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      for (const tg of t.tags) set.add(tg);
    }
    return Array.from(set).sort();
  }, [tasks]);

  const tagOptions: SelectOption<string>[] = useMemo(
    () => [
      { value: '__all__', label: 'All tags' },
      ...allTags.map((tg) => ({ value: tg, label: `#${tg}` })),
    ],
    [allTags]
  );

  const hasActiveFilter = Boolean(searchQuery || priorityFilter !== null || tagFilter);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 py-2.5 px-3 sm:px-4 mb-4 rounded-2xl bg-[var(--surface-2)] border border-[var(--border)]">
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        {/* Search input */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-[var(--text-3)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter tasks..."
            aria-label="Filter tasks by text"
            className="input-base w-full pl-8 pr-7 py-1.5 rounded-xl text-xs min-h-[36px]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search query"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-[var(--text-1)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Priority chips */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-full py-0.5">
          {([1, 2, 3, 4] as PriorityLevel[]).map((lvl) => {
            const meta = PRIORITY_META[lvl];
            const active = priorityFilter === lvl;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => setPriorityFilter(active ? null : lvl)}
                style={
                  active
                    ? {
                        backgroundColor: meta.bg,
                        borderColor: meta.color,
                        color: meta.color,
                      }
                    : undefined
                }
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition whitespace-nowrap shrink-0 min-h-[32px] ${
                  active
                    ? 'font-semibold'
                    : 'border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-1)] bg-[var(--surface-1)]'
                }`}
              >
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Tag select */}
        <CustomSelect
          size="sm"
          ariaLabel="Filter by tag"
          value={tagFilter || '__all__'}
          onChange={(v) => setTagFilter(v === '__all__' ? null : v)}
          options={tagOptions}
        />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setShowCompleted(!showCompleted)}
          className="btn-ghost px-2.5 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 min-h-[34px] whitespace-nowrap shrink-0"
        >
          {showCompleted ? (
            <>
              <Eye className="w-3.5 h-3.5 text-[var(--text-3)]" />
              <span className="hidden sm:inline">Completed</span>
            </>
          ) : (
            <>
              <EyeOff className="w-3.5 h-3.5 text-[var(--text-3)]" />
              <span className="hidden sm:inline">Hidden done</span>
            </>
          )}
        </button>

        <span className="text-xs text-[var(--text-3)] tnum whitespace-nowrap px-1">
          {matchCount} {matchCount === 1 ? 'task' : 'tasks'}
        </span>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-semibold text-[var(--accent)] hover:underline px-1.5 py-1 whitespace-nowrap"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
