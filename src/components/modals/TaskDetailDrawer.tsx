import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Calendar,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  Pause,
  Play,
  Plus,
  Presentation,
  Repeat,
  Square,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  PRIORITY_META,
  STATUS_META,
  type Attachment,
  type PriorityLevel,
  type RecurrenceType,
  type Task,
  type TaskStatus,
} from '../../db/schema';
import { addDaysStr, getTodayStr } from '../../lib/dateUtils';
import { useCadenceStore } from '../../store/useCadenceStore';
import { CustomSelect, ProgressBar, SegmentedControl, TagChip, type SelectOption } from '../ui/Primitives';

const STATUS_OPTIONS: SelectOption<TaskStatus>[] = [
  { value: 'todo', label: STATUS_META.todo.label, dotColor: STATUS_META.todo.color },
  { value: 'in_progress', label: STATUS_META.in_progress.label, dotColor: STATUS_META.in_progress.color },
  { value: 'in_review', label: STATUS_META.in_review.label, dotColor: STATUS_META.in_review.color },
  { value: 'done', label: STATUS_META.done.label, dotColor: STATUS_META.done.color },
];

const RECURRENCE_OPTIONS: SelectOption<string>[] = [
  { value: 'none', label: 'No recurrence' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-semibold text-[var(--text-1)]">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={idx} className="italic">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-[var(--surface-3)] font-mono text-[11px] text-[var(--accent)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function InteractiveMarkdownPreview({
  markdown,
  onToggleCheckboxLine,
}: {
  markdown: string;
  onToggleCheckboxLine: (lineIndex: number) => void;
}) {
  if (!markdown.trim()) {
    return (
      <p className="text-xs text-[var(--text-4)] italic">
        No notes yet. Switch to Edit to write markdown or - [ ] interactive checklists.
      </p>
    );
  }
  const lines = markdown.split('\n');
  return (
    <div className="space-y-1.5 text-xs text-[var(--text-2)] leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('## ')) {
          return (
            <h4
              key={idx}
              className="font-display text-sm font-semibold text-[var(--text-1)] pt-1"
            >
              {renderInlineFormatting(trimmed.slice(3))}
            </h4>
          );
        }
        const checkboxMatch = line.match(/^\s*-\s*\[( |x|X)\]\s*(.*)$/);
        if (checkboxMatch) {
          const checked = checkboxMatch[1].toLowerCase() === 'x';
          const content = checkboxMatch[2];
          return (
            <label
              key={idx}
              className="flex items-start gap-2 cursor-pointer py-0.5 hover:text-[var(--text-1)]"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleCheckboxLine(idx)}
                className="mt-0.5 rounded border-[var(--border-strong)] accent-[var(--accent)]"
              />
              <span className={checked ? 'line-through text-[var(--text-3)]' : ''}>
                {renderInlineFormatting(content)}
              </span>
            </label>
          );
        }
        if (trimmed.startsWith('- ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-[var(--text-3)]">•</span>
              <span>{renderInlineFormatting(trimmed.slice(2))}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInlineFormatting(line)}</p>;
      })}
    </div>
  );
}

function AttachmentIcon({ kind }: { kind: Attachment['kind'] }) {
  if (kind === 'doc') return <FileText className="w-4 h-4 text-[#3B82F6]" />;
  if (kind === 'sheet') return <FileSpreadsheet className="w-4 h-4 text-[#10B981]" />;
  if (kind === 'slide') return <Presentation className="w-4 h-4 text-[#F59E0B]" />;
  if (kind === 'image') return <ImageIcon className="w-4 h-4 text-[#8B5CF6]" />;
  return <Link2 className="w-4 h-4 text-[var(--accent)]" />;
}

export function TaskDetailDrawer() {
  const selectedTaskId = useCadenceStore((s) => s.selectedTaskId);
  const setSelectedTaskId = useCadenceStore((s) => s.setSelectedTaskId);
  const tasks = useCadenceStore((s) => s.tasks);

  const task = tasks.find((t) => t.id === selectedTaskId) || null;

  if (!task || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <div
        className="fixed inset-0 z-90 flex justify-end"
        style={{ backgroundColor: 'var(--overlay)' }}
        onClick={() => setSelectedTaskId(null)}
      >
        {/* Keyed by task.id so local state resets cleanly when switching tasks */}
        <TaskDetailBody
          key={task.id}
          task={task}
          onClose={() => setSelectedTaskId(null)}
        />
      </div>
    </AnimatePresence>,
    document.body
  );
}

function TaskDetailBody({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const patchTask = useCadenceStore((s) => s.patchTask);
  const deleteTaskUndoable = useCadenceStore((s) => s.deleteTaskUndoable);
  const duplicateTask = useCadenceStore((s) => s.duplicateTask);
  const setActiveModal = useCadenceStore((s) => s.setActiveModal);

  const focusTimer = useCadenceStore((s) => s.focusTimer);
  const startFocusTimer = useCadenceStore((s) => s.startFocusTimer);
  const togglePauseFocusTimer = useCadenceStore((s) => s.togglePauseFocusTimer);
  const stopFocusTimer = useCadenceStore((s) => s.stopFocusTimer);

  const [titleDraft, setTitleDraft] = useState(task.title);
  const [notesMode, setNotesMode] = useState<'preview' | 'edit'>(
    task.description ? 'preview' : 'edit'
  );
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');

  const handleTitleBlur = () => {
    const trimmed = titleDraft.trim() || 'Untitled task';
    setTitleDraft(trimmed);
    if (trimmed !== task.title) {
      patchTask(task.id, { title: trimmed });
    }
  };

  const handleToggleMarkdownCheckbox = (lineIndex: number) => {
    const lines = task.description.split('\n');
    const target = lines[lineIndex];
    if (!target) return;
    lines[lineIndex] = target.replace(/^(\s*-\s*\[)( |x|X)(\]\s*)/, (_m, p1, state, p3) => {
      const next = state.toLowerCase() === 'x' ? ' ' : 'x';
      return `${p1}${next}${p3}`;
    });
    patchTask(task.id, { description: lines.join('\n') });
  };

  const handleAddSubtask = () => {
    const clean = subtaskDraft.trim();
    if (!clean) return;
    const nextSubtasks = [
      ...task.subtasks,
      { id: `sub_${Date.now().toString(36)}`, title: clean, done: false },
    ];
    patchTask(task.id, { subtasks: nextSubtasks });
    setSubtaskDraft('');
  };

  const handleAddTag = () => {
    const clean = tagDraft.trim().replace(/^#/, '').toLowerCase();
    if (!clean || task.tags.includes(clean)) {
      setTagDraft('');
      return;
    }
    patchTask(task.id, { tags: [...task.tags, clean] });
    setTagDraft('');
  };

  const today = getTodayStr();
  const subtasksDone = task.subtasks.filter((s) => s.done).length;
  const estimatePct =
    task.estimated_minutes && task.estimated_minutes > 0
      ? Math.min(100, Math.round((task.actual_minutes / task.estimated_minutes) * 100))
      : 0;

  const isTimerOnThisTask = focusTimer.taskId === task.id;
  const timerMins = String(Math.floor(focusTimer.secondsLeft / 60)).padStart(2, '0');
  const timerSecs = String(focusTimer.secondsLeft % 60).padStart(2, '0');

  return (
    <motion.aside
      role="dialog"
      aria-modal="true"
      aria-label={`Task details: ${task.title}`}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      onClick={(e) => e.stopPropagation()}
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      className="popover-surface w-full sm:max-w-[480px] h-dvh flex flex-col overflow-hidden"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <CustomSelect
            size="sm"
            ariaLabel="Change task status"
            value={task.status}
            onChange={(nextStatus) => patchTask(task.id, { status: nextStatus })}
            options={STATUS_OPTIONS}
          />
          <SegmentedControl
            size="sm"
            ariaLabel="Task workspace"
            value={task.workspace}
            onChange={(ws) => patchTask(task.id, { workspace: ws })}
            options={[
              { value: 'office', label: 'Office' },
              { value: 'personal', label: 'Personal' },
            ]}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => patchTask(task.id, { important: !task.important })}
            aria-label={task.important ? 'Unmark as important' : 'Mark as important'}
            className={`p-2 rounded-xl border transition min-w-[38px] min-h-[38px] inline-flex items-center justify-center ${
              task.important
                ? 'bg-[#F59E0B]/15 border-[#F59E0B]/40 text-[#F59E0B]'
                : 'btn-ghost'
            }`}
          >
            <Star className={`w-4 h-4 ${task.important ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task detail drawer"
            className="btn-ghost p-2 rounded-xl min-w-[38px] min-h-[38px] inline-flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Editable Title */}
        <div>
          <label htmlFor="detail-task-title" className="sr-only">
            Task title
          </label>
          <input
            id="detail-task-title"
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            className="font-display text-lg font-bold text-[var(--text-1)] w-full bg-transparent border border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-2.5 py-1.5 -mx-2.5 focus:outline-none transition"
          />
        </div>

        {/* Priority Row (Words only: Urgent, High, Medium, Low) */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-[var(--text-3)]">Priority</div>
          <div className="grid grid-cols-4 gap-1.5">
            {([1, 2, 3, 4] as PriorityLevel[]).map((lvl) => {
              const meta = PRIORITY_META[lvl];
              const active = task.priority === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => patchTask(task.id, { priority: lvl })}
                  style={
                    active
                      ? {
                          backgroundColor: meta.bg,
                          borderColor: meta.color,
                          color: meta.color,
                        }
                      : undefined
                  }
                  className={`py-2 px-2 rounded-xl text-xs font-semibold border transition min-h-[38px] flex items-center justify-center gap-1.5 ${
                    active
                      ? ''
                      : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-2)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: meta.color }}
                  />
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Schedule + Quick Reschedule Chips */}
        <div className="space-y-2 p-3.5 rounded-2xl bg-[var(--surface-1)] border border-[var(--border)]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text-2)]">Schedule</span>
            <div className="flex flex-wrap items-center gap-1">
              {[
                { label: 'Today', date: today },
                { label: 'Tomorrow', date: addDaysStr(today, 1) },
                { label: 'Next week', date: addDaysStr(today, 7) },
                { label: 'Clear', date: null },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() =>
                    patchTask(task.id, {
                      due_date: chip.date,
                      ...(chip.date === null ? { due_time: null } : {}),
                    })
                  }
                  className="px-2 py-1 rounded-lg text-[11px] font-medium bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text-1)] hover:border-[var(--border-strong)] transition"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div>
              <label className="block text-[11px] text-[var(--text-3)] mb-1">Due Date</label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-[var(--text-3)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="date"
                  value={task.due_date || ''}
                  onChange={(e) =>
                    patchTask(task.id, { due_date: e.target.value || null })
                  }
                  className="input-base w-full pl-8 pr-2 py-1.5 rounded-xl text-xs min-h-[38px] tnum"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-[var(--text-3)] mb-1">Time</label>
              <div className="relative">
                <Clock className="w-3.5 h-3.5 text-[var(--text-3)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="time"
                  value={task.due_time || ''}
                  onChange={(e) =>
                    patchTask(task.id, { due_time: e.target.value || null })
                  }
                  className="input-base w-full pl-8 pr-2 py-1.5 rounded-xl text-xs min-h-[38px] tnum"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div>
              <label className="block text-[11px] text-[var(--text-3)] mb-1">Recurrence</label>
              <CustomSelect
                size="sm"
                ariaLabel="Task recurrence"
                value={task.recurrence || 'none'}
                onChange={(v) =>
                  patchTask(task.id, {
                    recurrence: v === 'none' ? null : (v as RecurrenceType),
                  })
                }
                options={RECURRENCE_OPTIONS}
                className="w-full"
                prefix={<Repeat className="w-3 h-3 text-[var(--text-3)]" />}
              />
            </div>
            <div>
              <label className="block text-[11px] text-[var(--text-3)] mb-1">
                Estimate (mins)
              </label>
              <input
                type="number"
                min={0}
                max={600}
                step={5}
                value={task.estimated_minutes ?? ''}
                onChange={(e) =>
                  patchTask(task.id, {
                    estimated_minutes: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="45"
                className="input-base w-full px-3 py-1.5 rounded-xl text-xs min-h-[34px] tnum"
              />
            </div>
          </div>

          {/* Time Tracking Progress */}
          <div className="pt-2 space-y-1">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-3)] tnum">
              <span>Logged focus: {task.actual_minutes}m</span>
              {task.estimated_minutes ? (
                <span>
                  {estimatePct}% of {task.estimated_minutes}m estimate
                </span>
              ) : (
                <span>No estimate set</span>
              )}
            </div>
            <ProgressBar value={task.actual_minutes} max={task.estimated_minutes || 60} />
          </div>
        </div>

        {/* Focus Timer Card */}
        <div className="p-3.5 rounded-2xl bg-[var(--accent-soft)] border border-[var(--border-strong)] flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[var(--text-1)]">
              Pomodoro Focus Sprint
            </div>
            <div className="text-[11px] text-[var(--text-3)] tnum">
              {isTimerOnThisTask
                ? `${focusTimer.mode === 'break' ? 'Restorative Break' : 'Active Focus'} · ${timerMins}:${timerSecs}`
                : '25m deep work · 5m break'}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isTimerOnThisTask ? (
              <>
                <button
                  type="button"
                  onClick={togglePauseFocusTimer}
                  className="btn-accent px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 min-h-[36px]"
                >
                  {focusTimer.running ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={stopFocusTimer}
                  aria-label="Stop timer"
                  className="btn-ghost p-2 rounded-xl min-h-[36px]"
                >
                  <Square className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => startFocusTimer(task.id, 'focus')}
                className="btn-accent px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 min-h-[38px]"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start 25m Focus</span>
              </button>
            )}
          </div>
        </div>

        {/* Subtasks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-1)]">
              Subtasks
            </span>
            <span className="text-xs text-[var(--text-3)] tnum">
              {subtasksDone}/{task.subtasks.length}
            </span>
          </div>
          {task.subtasks.length > 0 && (
            <ProgressBar
              value={subtasksDone}
              max={task.subtasks.length}
              color="#10B981"
            />
          )}

          <div className="space-y-1.5 pt-1">
            {task.subtasks.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[var(--surface-1)] border border-[var(--border)]"
              >
                <label className="flex items-center gap-2 text-xs text-[var(--text-1)] cursor-pointer flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={st.done}
                    onChange={() =>
                      patchTask(task.id, {
                        subtasks: task.subtasks.map((item) =>
                          item.id === st.id ? { ...item, done: !item.done } : item
                        ),
                      })
                    }
                    className="rounded accent-[var(--accent)]"
                  />
                  <span className={`truncate ${st.done ? 'line-through text-[var(--text-3)]' : ''}`}>
                    {st.title}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    patchTask(task.id, {
                      subtasks: task.subtasks.filter((item) => item.id !== st.id),
                    })
                  }
                  aria-label={`Delete subtask ${st.title}`}
                  className="text-[var(--text-3)] hover:text-[#F43F5E] p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={subtaskDraft}
                onChange={(e) => setSubtaskDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
                placeholder="Add a subtask..."
                className="input-base flex-1 px-3 py-1.5 rounded-xl text-xs min-h-[36px]"
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                className="btn-ghost px-3 py-1.5 rounded-xl text-xs font-medium min-h-[36px]"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Markdown Notes with Interactive Checkboxes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-1)]">
              Markdown Notes
            </span>
            <SegmentedControl
              size="sm"
              ariaLabel="Notes view mode"
              value={notesMode}
              onChange={setNotesMode}
              options={[
                { value: 'preview', label: 'Preview' },
                { value: 'edit', label: 'Edit' },
              ]}
            />
          </div>

          {notesMode === 'edit' ? (
            <textarea
              rows={5}
              value={task.description}
              onChange={(e) => patchTask(task.id, { description: e.target.value })}
              placeholder="Write ## headings, **bold**, *italic*, `code`, or interactive - [ ] checklists..."
              className="input-base w-full p-3 rounded-xl text-xs font-mono leading-relaxed"
            />
          ) : (
            <div className="p-3.5 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] min-h-[84px]">
              <InteractiveMarkdownPreview
                markdown={task.description}
                onToggleCheckboxLine={handleToggleMarkdownCheckbox}
              />
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-[var(--text-1)]">Tags</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {task.tags.map((tg) => (
              <TagChip
                key={tg}
                tag={tg}
                onRemove={() =>
                  patchTask(task.id, {
                    tags: task.tags.filter((item) => item !== tg),
                  })
                }
              />
            ))}
            <div className="inline-flex items-center gap-1">
              <input
                type="text"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="+ tag"
                className="input-base px-2.5 py-1 rounded-lg text-xs w-24 min-h-[30px]"
              />
            </div>
          </div>
        </div>

        {/* Google Drive Attachments */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-1)]">
              Google Drive Attachments
            </span>
            <button
              type="button"
              onClick={() => setActiveModal('drive')}
              className="btn-ghost px-2.5 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#3B82F6]" />
              <span>Attach from Drive</span>
            </button>
          </div>

          {task.attachments.length === 0 ? (
            <div className="text-xs text-[var(--text-4)] py-2">
              No files attached. Connect Google Drive docs, sheets, or decks.
            </div>
          ) : (
            <div className="space-y-1.5">
              {task.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] text-xs"
                >
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 font-medium text-[var(--text-1)] hover:text-[var(--accent)] truncate"
                  >
                    <AttachmentIcon kind={att.kind} />
                    <span className="truncate">{att.name}</span>
                    <ExternalLink className="w-3 h-3 text-[var(--text-3)] shrink-0" />
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      patchTask(task.id, {
                        attachments: task.attachments.filter((a) => a.id !== att.id),
                      })
                    }
                    aria-label={`Remove attachment ${att.name}`}
                    className="text-[var(--text-3)] hover:text-[#F43F5E] p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer with Delete / Duplicate / Important */}
      <div className="px-5 py-3.5 border-t border-[var(--border)] bg-[var(--popover-muted)] flex items-center justify-between gap-2 shrink-0">
        <button
          type="button"
          onClick={() => deleteTaskUndoable(task.id)}
          className="px-3 py-2 rounded-xl text-xs font-semibold text-[#F43F5E] bg-[#F43F5E]/10 hover:bg-[#F43F5E]/20 transition inline-flex items-center gap-1.5 min-h-[38px]"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void duplicateTask(task.id)}
            className="btn-ghost px-3 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 min-h-[38px]"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>
          <button
            type="button"
            onClick={() => patchTask(task.id, { important: !task.important })}
            className="btn-ghost px-3 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 min-h-[38px]"
          >
            <Star
              className={`w-3.5 h-3.5 ${
                task.important ? 'text-[#F59E0B] fill-current' : ''
              }`}
            />
            <span>{task.important ? 'Important' : 'Mark Important'}</span>
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
