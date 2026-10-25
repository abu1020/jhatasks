import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Calendar,
  Clock,
  Hourglass,
  Plus,
  Repeat,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import {
  PRIORITY_META,
  STATUS_META,
  type PriorityLevel,
  type RecurrenceType,
  type TaskStatus,
  type WorkspaceType,
} from '../../db/schema';
import { getTodayStr } from '../../lib/dateUtils';
import { parseTaskInput } from '../../lib/nlpParser';
import { useCadenceStore } from '../../store/useCadenceStore';
import { CustomSelect, SegmentedControl, TagChip, type SelectOption } from '../ui/Primitives';

const STATUS_OPTIONS: SelectOption<TaskStatus>[] = [
  { value: 'todo', label: STATUS_META.todo.label, dotColor: STATUS_META.todo.color },
  { value: 'in_progress', label: STATUS_META.in_progress.label, dotColor: STATUS_META.in_progress.color },
  { value: 'in_review', label: STATUS_META.in_review.label, dotColor: STATUS_META.in_review.color },
  { value: 'done', label: STATUS_META.done.label, dotColor: STATUS_META.done.color },
];

const PRIORITY_OPTIONS: SelectOption<string>[] = [
  { value: '1', label: 'Urgent', dotColor: PRIORITY_META[1].color },
  { value: '2', label: 'High', dotColor: PRIORITY_META[2].color },
  { value: '3', label: 'Medium', dotColor: PRIORITY_META[3].color },
  { value: '4', label: 'Low', dotColor: PRIORITY_META[4].color },
];

const RECURRENCE_OPTIONS: SelectOption<string>[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export function TaskComposerModal() {
  const composer = useCadenceStore((s) => s.composer);
  const closeComposer = useCadenceStore((s) => s.closeComposer);
  const globalWorkspace = useCadenceStore((s) => s.workspace);
  const createTask = useCadenceStore((s) => s.createTask);
  const addToast = useCadenceStore((s) => s.addToast);

  if (!composer.open || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 z-100 flex items-end sm:items-center justify-center sm:p-4"
        style={{ backgroundColor: 'var(--overlay)' }}
        onClick={closeComposer}
      >
        <ComposerFormBody
          key={`${composer.status || 'todo'}-${composer.due_date || ''}-${composer.due_time || ''}`}
          defaultWorkspace={
            composer.workspace || (globalWorkspace === 'personal' ? 'personal' : 'office')
          }
          defaultStatus={composer.status || 'todo'}
          defaultDate={composer.due_date !== undefined ? composer.due_date || '' : getTodayStr()}
          defaultTime={composer.due_time || ''}
          initialTitle={composer.initialTitle || ''}
          onClose={closeComposer}
          onCreate={createTask}
          addToast={addToast}
        />
      </div>
    </AnimatePresence>,
    document.body
  );
}

function ComposerFormBody({
  defaultWorkspace,
  defaultStatus,
  defaultDate,
  defaultTime,
  initialTitle,
  onClose,
  onCreate,
  addToast,
}: {
  defaultWorkspace: WorkspaceType;
  defaultStatus: TaskStatus;
  defaultDate: string;
  defaultTime: string;
  initialTitle: string;
  onClose: () => void;
  onCreate: ReturnType<typeof useCadenceStore.getState>['createTask'];
  addToast: ReturnType<typeof useCadenceStore.getState>['addToast'];
}) {
  const [rawTitle, setRawTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [workspace, setWorkspace] = useState<WorkspaceType>(defaultWorkspace);
  const [status, setStatus] = useState<TaskStatus>(defaultStatus);
  const [priority, setPriority] = useState<PriorityLevel>(3);
  const [dueDate, setDueDate] = useState<string>(defaultDate);
  const [dueTime, setDueTime] = useState<string>(defaultTime);
  const [recurrence, setRecurrence] = useState<RecurrenceType | 'none'>('none');
  const [estimate, setEstimate] = useState<string>('45');
  const [manualTags, setManualTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    titleInputRef.current?.focus();
  }, []);

  const nlp = useMemo(() => parseTaskInput(rawTitle, getTodayStr()), [rawTitle]);

  const effectiveWorkspace = nlp.workspace || workspace;
  const effectivePriority = nlp.priority || priority;
  const effectiveDate = nlp.due_date || dueDate;
  const effectiveTime = nlp.due_time || dueTime;
  const effectiveRecurrence =
    nlp.recurrence || (recurrence === 'none' ? null : recurrence);
  const effectiveEstimate =
    nlp.estimated_minutes !== undefined
      ? nlp.estimated_minutes
      : estimate
      ? Number(estimate)
      : null;
  const effectiveTags = Array.from(new Set([...manualTags, ...nlp.tags]));

  const handleSubmit = async (mode: 'create_open' | 'create_another' | 'create_close') => {
    const finalTitle = (nlp.cleanTitle || rawTitle).trim();
    if (!finalTitle) {
      setError('Task title cannot be empty. Type a title to continue.');
      titleInputRef.current?.focus();
      return;
    }
    setError(null);

    await onCreate(
      {
        title: finalTitle,
        description,
        workspace: effectiveWorkspace,
        status,
        priority: effectivePriority,
        due_date: effectiveDate || null,
        due_time: effectiveTime || null,
        recurrence: effectiveRecurrence,
        estimated_minutes: effectiveEstimate,
        tags: effectiveTags,
        source: 'manual',
      },
      { openDetail: mode === 'create_open' }
    );

    if (mode === 'create_another') {
      setRawTitle('');
      setDescription('');
      setManualTags([]);
      addToast({ message: `Created "${finalTitle}"`, tone: 'success' });
      titleInputRef.current?.focus();
    } else {
      addToast({ message: `Created "${finalTitle}"`, tone: 'success' });
      onClose();
    }
  };

  const handleAddTag = () => {
    const clean = tagDraft.trim().replace(/^#/, '').toLowerCase();
    if (clean && !manualTags.includes(clean)) {
      setManualTags([...manualTags, clean]);
    }
    setTagDraft('');
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="New task composer"
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      onClick={(e) => e.stopPropagation()}
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      className="popover-surface w-full max-w-xl rounded-t-3xl sm:rounded-2xl max-h-[92dvh] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="font-display text-sm font-semibold text-[var(--text-1)]">
            Create Task
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            size="sm"
            ariaLabel="Task workspace"
            value={effectiveWorkspace}
            onChange={(val) => setWorkspace(val)}
            options={[
              { value: 'office', label: 'Office' },
              { value: 'personal', label: 'Personal' },
            ]}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task composer"
            className="btn-ghost p-1.5 rounded-xl min-w-[36px] min-h-[36px] inline-flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Form body */}
      <div className="p-5 overflow-y-auto space-y-4">
        <div>
          <label htmlFor="composer-title-input" className="sr-only">
            Task title
          </label>
          <input
            id="composer-title-input"
            ref={titleInputRef}
            type="text"
            value={rawTitle}
            onChange={(e) => {
              setRawTitle(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSubmit('create_open');
              } else if (e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit('create_close');
              }
            }}
            placeholder="e.g. Finalize Q4 board deck #office !urgent tomorrow at 10:00 for 45m"
            className={`input-base w-full px-3.5 py-2.5 rounded-xl text-sm font-medium ${
              error ? 'border-[#F43F5E]' : ''
            }`}
          />
          {error && (
            <p role="alert" className="text-xs font-medium text-[#F43F5E] mt-1.5">
              {error}
            </p>
          )}

          {/* Live NLP Detected Chips */}
          {nlp.chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[11px] font-medium text-[var(--text-3)]">
                Detected:
              </span>
              {nlp.chips.map((c, idx) => (
                <span
                  key={`${c.raw}-${idx}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[var(--accent-soft)] text-[var(--accent)]"
                >
                  <span>{c.label}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Notes / Description */}
        <div>
          <label htmlFor="composer-desc" className="block text-xs font-medium text-[var(--text-3)] mb-1">
            Notes & Markdown Checklist (optional)
          </label>
          <textarea
            id="composer-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add context, links, or - [ ] checklist items..."
            className="input-base w-full px-3 py-2 rounded-xl text-xs resize-none"
          />
        </div>

        {/* Structured Controls Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-3)] mb-1">
              Status
            </label>
            <CustomSelect
              ariaLabel="Task status"
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-3)] mb-1">
              Priority
            </label>
            <CustomSelect
              ariaLabel="Task priority"
              value={String(effectivePriority)}
              onChange={(v) => setPriority(Number(v) as PriorityLevel)}
              options={PRIORITY_OPTIONS}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[var(--text-3)] mb-1">
              Recurrence
            </label>
            <CustomSelect
              ariaLabel="Task recurrence"
              value={effectiveRecurrence || 'none'}
              onChange={(v) => setRecurrence(v as RecurrenceType | 'none')}
              options={RECURRENCE_OPTIONS}
              className="w-full"
              prefix={<Repeat className="w-3.5 h-3.5 text-[var(--text-3)]" />}
            />
          </div>

          <div>
            <label
              htmlFor="composer-due-date"
              className="block text-[11px] font-medium text-[var(--text-3)] mb-1"
            >
              Due Date
            </label>
            <div className="relative">
              <Calendar className="w-3.5 h-3.5 text-[var(--text-3)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="composer-due-date"
                type="date"
                value={effectiveDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-base w-full pl-8 pr-2.5 py-2 rounded-xl text-xs min-h-[40px] tnum"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="composer-due-time"
              className="block text-[11px] font-medium text-[var(--text-3)] mb-1"
            >
              Due Time
            </label>
            <div className="relative">
              <Clock className="w-3.5 h-3.5 text-[var(--text-3)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="composer-due-time"
                type="time"
                value={effectiveTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="input-base w-full pl-8 pr-2.5 py-2 rounded-xl text-xs min-h-[40px] tnum"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="composer-estimate"
              className="block text-[11px] font-medium text-[var(--text-3)] mb-1"
            >
              Estimate (mins)
            </label>
            <div className="relative">
              <Hourglass className="w-3.5 h-3.5 text-[var(--text-3)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="composer-estimate"
                type="number"
                min={5}
                max={480}
                step={5}
                value={effectiveEstimate ?? ''}
                onChange={(e) => setEstimate(e.target.value)}
                placeholder="45"
                className="input-base w-full pl-8 pr-2.5 py-2 rounded-xl text-xs min-h-[40px] tnum"
              />
            </div>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label
            htmlFor="composer-tag-input"
            className="block text-[11px] font-medium text-[var(--text-3)] mb-1"
          >
            Tags
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {effectiveTags.map((tg) => (
              <TagChip
                key={tg}
                tag={tg}
                onRemove={() =>
                  setManualTags(manualTags.filter((item) => item !== tg))
                }
              />
            ))}
            <div className="inline-flex items-center gap-1">
              <div className="relative">
                <Tag className="w-3 h-3 text-[var(--text-3)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="composer-tag-input"
                  type="text"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleAddTag();
                    }
                  }}
                  placeholder="Add tag..."
                  className="input-base pl-7 pr-2 py-1 rounded-lg text-xs w-28 min-h-[32px]"
                />
              </div>
              {tagDraft && (
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="btn-ghost px-2 py-1 rounded-lg text-xs"
                >
                  Add
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-5 py-3.5 border-t border-[var(--border)] bg-[var(--popover-muted)] flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-[var(--text-3)] hidden sm:flex items-center gap-1.5">
          <span className="kbd">↵</span> Create
          <span className="mx-1">·</span>
          <span className="kbd">⌘↵</span> Create & open
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => void handleSubmit('create_another')}
            className="btn-ghost px-3 py-2 rounded-xl text-xs font-medium min-h-[38px]"
          >
            Create & add another
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit('create_open')}
            className="btn-accent px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 min-h-[38px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create task</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
