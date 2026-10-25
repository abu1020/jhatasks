import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bot,
  ChevronDown,
  CornerDownLeft,
  MessageCircle,
  Minus,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { PRIORITY_META, STATUS_META, type PriorityLevel, type Task, type TaskStatus, type ViewId } from '../../db/schema';
import { formatHumanDate, getTodayStr } from '../../lib/dateUtils';
import { parseTaskInput } from '../../lib/nlpParser';
import { useCadenceStore } from '../../store/useCadenceStore';

type ChatMessage = { id: number; role: 'assistant' | 'user'; text: string };

const VIEWS: Record<string, ViewId> = {
  'my day': 'my_day', today: 'my_day', board: 'board', kanban: 'board', list: 'list',
  calendar: 'calendar', matrix: 'matrix', eisenhower: 'matrix', insights: 'insights', analytics: 'insights',
};
const STATUS_ALIASES: Record<string, TaskStatus> = {
  'to do': 'todo', todo: 'todo', backlog: 'todo', 'in progress': 'in_progress', doing: 'in_progress',
  'in review': 'in_review', review: 'in_review', done: 'done', complete: 'done', completed: 'done',
};
const PRIORITIES: Record<string, PriorityLevel> = {
  urgent: 1, highest: 1, high: 2, medium: 3, normal: 3, low: 4,
};
const cleanQuotes = (value: string) => value.trim().replace(/^['"“”]|['"“”]$/g, '').trim();
const makeMessage = (role: ChatMessage['role'], text: string): ChatMessage => ({ id: Date.now() + Math.random(), role, text });

function taskMatches(tasks: Task[], query: string): Task[] {
  const normalized = cleanQuotes(query).toLowerCase().replace(/^(the task|task)\s+/i, '').trim();
  if (!normalized) return [];
  const words = normalized.split(/\s+/).filter(Boolean);
  return tasks
    .map((task) => {
      const title = task.title.toLowerCase();
      let score = title === normalized ? 100 : title.includes(normalized) ? 80 : 0;
      if (!score) score = words.filter((word) => title.includes(word)).length * 10;
      return { task, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title))
    .map((item) => item.task);
}

function taskLabel(task: Task) {
  return `“${task.title}”`;
}

export function InHouseAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    makeMessage('assistant', 'Hi! I’m your in-house Cadence assistant. I run locally in this app—no AI API key or external AI service needed. Ask me to manage tasks, plan your day, navigate views, or control focus mode.'),
  ]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, busy]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const addAssistant = (text: string) => setMessages((current) => [...current, makeMessage('assistant', text)]);

  const respond = async (raw: string) => {
    const input = raw.trim();
    if (!input || busy) return;
    setMessages((current) => [...current, makeMessage('user', input)]);
    setDraft('');
    setBusy(true);
    try {
      const answer = await handleRequest(input);
      addAssistant(answer);
    } catch {
      addAssistant('I couldn’t complete that action. Please try again or use the app controls directly.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const handleRequest = async (rawInput: string): Promise<string> => {
    const input = rawInput.trim();
    const lower = input.toLowerCase().replace(/[.!?]+$/, '');
    const state = useCadenceStore.getState();
    const openTasks = state.tasks.filter((task) => task.status !== 'done');

    if (/^(hi|hello|hey|good morning|good afternoon)\b/.test(lower)) return 'Hello! What would you like to get done? Try “add task prepare launch brief tomorrow !high” or “show my urgent tasks”.';
    if (/^(help|what can you do|commands|capabilities)(\s|$)/.test(lower)) {
      return 'I can create tasks from plain language; find, open, complete, reopen, rename, reprioritize, reschedule, move, duplicate, or delete tasks (with Undo); show task lists and summaries; switch views/workspaces/themes; search or clear filters; plan your day; and control the focus timer. I can also open Settings, shortcuts, Gmail, Drive, and data import/export panels. Google/Gmail/Drive actions still require their normal sign-in and permissions.';
    }

    const viewRequest = lower.match(/\b(?:go to|open|show|switch to)\s+(my day|today|board|kanban|list|calendar|matrix|eisenhower|insights|analytics)(?:\s+view)?\b/);
    if (viewRequest) {
      const key = viewRequest[1];
      state.setActiveView(VIEWS[key]);
      return `Done — switched to ${key === 'today' ? 'My Day' : key[0].toUpperCase() + key.slice(1)}.`;
    }
    if (/\b(?:dark mode|turn on dark|use dark theme)\b/.test(lower)) {
      state.setTheme('dark'); return 'Dark theme is on.';
    }
    if (/\b(?:light mode|turn on light|use light theme)\b/.test(lower)) {
      state.setTheme('light'); return 'Light theme is on.';
    }
    if (/\b(?:toggle|switch) theme\b/.test(lower)) {
      state.toggleTheme(); return `Switched to ${useCadenceStore.getState().theme} theme.`;
    }
    const workspaceRequest = lower.match(/\b(?:switch|show|use|filter to)\s+(all|office|work|personal|home)(?:\s+workspace)?\b/);
    if (workspaceRequest) {
      const value = workspaceRequest[1];
      const workspace = value === 'work' ? 'office' : value === 'home' ? 'personal' : value;
      state.setWorkspace(workspace as 'all' | 'office' | 'personal');
      return `Showing the ${workspace} workspace.`;
    }
    if (/\b(?:clear|reset) (?:all )?(?:filters|search)\b/.test(lower)) {
      state.clearFilters(); return 'Cleared search and task filters.';
    }
    const searchRequest = input.match(/\b(?:search|find)\s+(?:for\s+)?(.+)$/i);
    if (searchRequest) {
      const query = cleanQuotes(searchRequest[1]);
      state.setSearchQuery(query);
      state.setActiveView('list');
      return `Searching tasks for “${query}” in List view.`;
    }

    if (/\b(?:plan|schedule|organize) (?:my )?(?:day|today)\b/.test(lower)) {
      const count = state.planMyDay();
      state.setActiveView('my_day');
      return count ? `Planned ${count} task${count === 1 ? '' : 's'} around your calendar. You can review the schedule in My Day.` : 'Your day is already planned, or there are no eligible tasks to schedule.';
    }

    if (/\b(?:open|show) settings\b/.test(lower)) { state.setSettingsOpen(true); return 'Opened Settings.'; }
    if (/\b(?:keyboard )?shortcuts\b/.test(lower)) { state.setActiveModal('shortcuts'); return 'Opened the keyboard shortcuts guide.'; }
    if (/\b(?:open|show) (?:gmail|email|inbox)\b/.test(lower)) { state.setActiveModal('gmail'); return 'Opened Gmail tools. A connected Google account is required for live mailbox access.'; }
    if (/\b(?:open|show) (?:google )?drive\b/.test(lower)) { state.setActiveModal('drive'); return 'Opened Drive tools. Google sign-in and permissions may be required.'; }
    if (/\b(?:import|export|backup|restore) (?:tasks|data|json|csv)?\b/.test(lower)) { state.setActiveModal('tasks_io'); return 'Opened task import/export tools.'; }
    if (/\b(?:new task|create task|add task|quick add)\s*$/i.test(input)) {
      state.openComposer(); return 'Opened the task composer. Add a title and any details, then save.';
    }

    const createMatch = input.match(/^(?:please\s+)?(?:add|create|make|remember|remind me to)\s+(?:a\s+)?(?:new\s+)?task\s*[:\-]?\s*(.+)$/i)
      || input.match(/^(?:please\s+)?(?:add|create|make|remember|remind me to)\s+(.+)$/i);
    if (createMatch?.[1]) {
      const parsed = parseTaskInput(createMatch[1], getTodayStr());
      if (!parsed.cleanTitle) return 'What should I call the task? For example: “add task send the proposal tomorrow !high”.';
      const task = await state.createTask({
        title: parsed.cleanTitle,
        workspace: parsed.workspace ?? (state.workspace === 'personal' ? 'personal' : 'office'),
        priority: parsed.priority ?? 3,
        important: parsed.priority === 1 || parsed.priority === 2,
        due_date: parsed.due_date ?? getTodayStr(),
        due_time: parsed.due_time ?? null,
        recurrence: parsed.recurrence ?? null,
        estimated_minutes: parsed.estimated_minutes ?? null,
        tags: parsed.tags,
        source: 'quick-add',
      });
      return `Created ${taskLabel(task)}${task.due_date ? `, due ${formatHumanDate(task.due_date, getTodayStr())}` : ''}${task.priority <= 2 ? `, ${PRIORITY_META[task.priority].label.toLowerCase()} priority` : ''}.`;
    }

    if (/\b(?:how many|summary|summarize|status report|what(?:'s| is) on my plate|what should i work on)\b/.test(lower)) {
      const today = getTodayStr();
      const overdue = openTasks.filter((task) => task.due_date && task.due_date < today);
      const dueToday = openTasks.filter((task) => task.due_date === today);
      const urgent = openTasks.filter((task) => task.priority === 1);
      const completed = state.tasks.filter((task) => task.status === 'done').length;
      const suggested = [...openTasks].sort((a, b) => a.priority - b.priority || (a.due_date || '9999').localeCompare(b.due_date || '9999'))[0];
      return `You have ${openTasks.length} open task${openTasks.length === 1 ? '' : 's'} and ${completed} completed. ${overdue.length} overdue, ${dueToday.length} due today, ${urgent.length} urgent.${suggested ? ` Suggested next: ${taskLabel(suggested)}.` : ''}`;
    }

    const taskListRequest = lower.match(/\b(?:show|list|what are)\s+(?:all\s+)?(?:my\s+)?(?:(urgent|overdue|completed|done|today)\s+)?(?:tasks|to dos)\b/);
    if (taskListRequest) {
      const filter = taskListRequest[1];
      const list = filter === 'completed' || filter === 'done'
        ? state.tasks.filter((task) => task.status === 'done')
        : filter === 'overdue'
        ? openTasks.filter((task) => task.due_date && task.due_date < getTodayStr())
        : filter === 'today'
        ? openTasks.filter((task) => task.due_date === getTodayStr())
        : filter === 'urgent'
        ? openTasks.filter((task) => task.priority === 1)
        : openTasks;
      state.setActiveView('list');
      if (!list.length) return 'There are no matching tasks.';
      return `Here are ${list.length} task${list.length === 1 ? '' : 's'}: ${list.slice(0, 8).map((task) => `${task.title} (${STATUS_META[task.status].label}${task.due_date ? ` · ${task.due_date}` : ''})`).join('; ')}${list.length > 8 ? `; and ${list.length - 8} more` : ''}. I opened List view.`;
    }

    const timerStart = lower.match(/\b(?:start|begin) (?:a )?(?:focus )?(?:timer|session)(?:\s+(?:for|on)\s+(.+))?/);
    if (timerStart) {
      const query = timerStart[1] || '';
      const target = query ? taskMatches(openTasks, query)[0] : [...openTasks].sort((a, b) => a.priority - b.priority)[0];
      if (!target) return 'I couldn’t find an open task to focus on. Tell me the task title or create one first.';
      state.startFocusTimer(target.id);
      return `Focus session started for ${taskLabel(target)}.`;
    }
    if (/\b(?:pause|resume|continue) (?:my )?(?:focus )?timer\b/.test(lower)) {
      if (!state.focusTimer.taskId) return 'There is no active focus timer.';
      const shouldPause = /\bpause\b/.test(lower);
      if (state.focusTimer.running !== !shouldPause) state.togglePauseFocusTimer();
      return shouldPause ? 'Focus timer paused.' : 'Focus timer resumed.';
    }
    if (/\b(?:stop|end|cancel) (?:my )?(?:focus )?timer\b/.test(lower)) {
      if (!state.focusTimer.taskId) return 'There is no active focus timer.';
      state.stopFocusTimer(); return 'Focus timer stopped.';
    }

    const operations: { regex: RegExp; action: string }[] = [
      { regex: /^(?:please\s+)?mark\s+(?:the\s+)?(?:task\s+)?(.+?)\s+(?:as\s+)?(?:done|complete|completed)$/i, action: 'complete' },
      { regex: /^(?:please\s+)?(?:complete|finish|mark(?:\s+as)?\s+done)\s+(?:the\s+)?(?:task\s+)?(.+)$/i, action: 'complete' },
      { regex: /^(?:please\s+)?(?:reopen|undo completion of|mark as to do)\s+(?:the\s+)?(?:task\s+)?(.+)$/i, action: 'reopen' },
      { regex: /^(?:please\s+)?(?:delete|remove)\s+(?:the\s+)?(?:task\s+)?(.+)$/i, action: 'delete' },
      { regex: /^(?:please\s+)?(?:duplicate|copy)\s+(?:the\s+)?(?:task\s+)?(.+)$/i, action: 'duplicate' },
      { regex: /^(?:please\s+)?(?:open|show)\s+(?:the\s+)?(?:task\s+)?(.+)$/i, action: 'open' },
      { regex: /^(?:please\s+)?(?:rename|retitle)\s+(?:the\s+)?(?:task\s+)?(.+?)\s+(?:to|as)\s+(.+)$/i, action: 'rename' },
      { regex: /^(?:please\s+)?(?:set|change)\s+(?:the\s+)?priority\s+(?:of\s+)?(?:the\s+)?(?:task\s+)?(.+?)\s+to\s+(urgent|high|medium|normal|low)$/i, action: 'priority' },
      { regex: /^(?:please\s+)?move\s+(?:the\s+)?(?:task\s+)?(.+?)\s+to\s+(to do|todo|backlog|in progress|doing|in review|review|done|completed)$/i, action: 'status' },
      { regex: /^(?:please\s+)?(?:reschedule|schedule)\s+(?:the\s+)?(?:task\s+)?(.+?)\s+(?:to|for|by)\s+(.+)$/i, action: 'date' },
      { regex: /^(?:please\s+)?move\s+(?:the\s+)?(?:task\s+)?(.+?)\s+to\s+(office|work|personal|home)(?:\s+workspace)?$/i, action: 'workspace' },
    ];
    for (const operation of operations) {
      const match = input.match(operation.regex);
      if (!match) continue;
      const query = cleanQuotes(match[1]);
      const matches = taskMatches(state.tasks, query);
      if (!matches.length) return `I couldn’t find a task matching “${query}”. Try a few words from its title.`;
      if (matches.length > 1 && matches[0].title.toLowerCase() !== matches[1].title.toLowerCase() && matches[0].title.toLowerCase() !== query.toLowerCase()) {
        return `I found a few possible matches: ${matches.slice(0, 4).map((task) => task.title).join('; ')}. Please be more specific.`;
      }
      const task = matches[0];
      if (operation.action === 'complete') {
        if (task.status === 'done') return `${taskLabel(task)} is already complete.`;
        state.patchTask(task.id, { status: 'done' }); return `Marked ${taskLabel(task)} complete.`;
      }
      if (operation.action === 'reopen') {
        state.patchTask(task.id, { status: 'todo' }); return `Reopened ${taskLabel(task)}.`;
      }
      if (operation.action === 'delete') {
        state.deleteTaskUndoable(task.id); return `Deleted ${taskLabel(task)}. You can use Undo in the app notification for the next few seconds.`;
      }
      if (operation.action === 'duplicate') {
        const copy = await state.duplicateTask(task.id); return copy ? `Duplicated ${taskLabel(task)} as ${taskLabel(copy)}.` : 'I could not duplicate that task.';
      }
      if (operation.action === 'open') {
        state.setSelectedTaskId(task.id); return `Opened ${taskLabel(task)}.`;
      }
      if (operation.action === 'rename') {
        const title = cleanQuotes(match[2]);
        if (!title) return 'Please include the new task title.';
        state.patchTask(task.id, { title }); return `Renamed the task to “${title}”.`;
      }
      if (operation.action === 'priority') {
        const priority = PRIORITIES[match[2].toLowerCase()];
        state.patchTask(task.id, { priority, important: priority <= 2 }); return `Set ${taskLabel(task)} to ${PRIORITY_META[priority].label.toLowerCase()} priority.`;
      }
      if (operation.action === 'status') {
        const status = STATUS_ALIASES[match[2].toLowerCase()];
        state.patchTask(task.id, { status }); return `Moved ${taskLabel(task)} to ${STATUS_META[status].label}.`;
      }
      if (operation.action === 'date') {
        const parsed = parseTaskInput(`task ${match[2]}`, getTodayStr());
        if (!parsed.due_date) return 'I couldn’t understand that date. Try “tomorrow”, “Friday”, or “in 3 days”.';
        state.patchTask(task.id, { due_date: parsed.due_date, ...(parsed.due_time ? { due_time: parsed.due_time } : {}) });
        return `Rescheduled ${taskLabel(task)} for ${formatHumanDate(parsed.due_date, getTodayStr())}${parsed.due_time ? ` at ${parsed.due_time}` : ''}.`;
      }
      if (operation.action === 'workspace') {
        const value = match[2].toLowerCase();
        const workspace = value === 'work' ? 'office' : value === 'home' ? 'personal' : value;
        state.patchTask(task.id, { workspace: workspace as 'office' | 'personal' }); return `Moved ${taskLabel(task)} to the ${workspace} workspace.`;
      }
    }

    if (/\b(?:calendar|event|meeting)s?\b/.test(lower) && /\b(?:show|list|what|upcoming)\b/.test(lower)) {
      state.setActiveView('calendar');
      const today = getTodayStr();
      const events = state.events.filter((event) => event.date >= today).slice(0, 5);
      return events.length ? `Opened Calendar. Upcoming: ${events.map((event) => `${event.title} on ${event.date} at ${event.start_time}`).join('; ')}.` : 'Opened Calendar. There are no upcoming events loaded.';
    }

    return 'I didn’t recognize that request. Try “help” to see what I can do. You can ask me to add a task, complete a task, switch to Calendar, plan my day, or start a focus timer.';
  };

  const quickPrompts = ['Add task: prepare weekly plan tomorrow', 'Show my urgent tasks', 'Plan my day', 'Help'];

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Close in-house assistant' : 'Open in-house assistant'}
        title="In-house assistant"
        onClick={() => setOpen((value) => !value)}
        className="fixed z-[70] bottom-5 right-5 sm:bottom-6 sm:right-6 w-14 h-14 rounded-full btn-accent shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        {open ? <X className="w-5 h-5" /> : <MessageCircle className="w-6 h-6" />}
        {!open && <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[var(--bg)]" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label="In-house Cadence assistant"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed z-[69] right-3 bottom-[84px] sm:right-6 sm:bottom-24 w-[calc(100vw-1.5rem)] sm:w-[390px] h-[min(610px,calc(100dvh-7rem))] rounded-3xl border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl overflow-hidden flex flex-col"
          >
            <header className="px-4 py-3.5 border-b border-[var(--border)] bg-[var(--surface-2)] flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center"><Bot className="w-5 h-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm font-bold text-[var(--text-1)]">Cadence Assistant</div>
                <div className="text-[10px] text-[var(--text-3)] flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> In-house · no AI API key</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Minimize assistant" className="btn-ghost rounded-lg p-2"><Minus className="w-4 h-4" /></button>
              <button type="button" onClick={() => { setMessages([makeMessage('assistant', 'Chat cleared. I’m ready to help—what would you like to do?')]); }} aria-label="Clear chat" className="btn-ghost rounded-lg p-2"><ChevronDown className="w-4 h-4" /></button>
            </header>

            <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ${message.role === 'user' ? 'bg-[var(--accent)] text-white rounded-br-md' : 'bg-[var(--surface-2)] text-[var(--text-1)] border border-[var(--border)] rounded-bl-md'}`}>
                    {message.role === 'assistant' && <Sparkles className="inline w-3.5 h-3.5 mr-1.5 text-[var(--accent)] -mt-0.5" />}{message.text}
                  </div>
                </div>
              ))}
              {busy && <div className="text-xs text-[var(--text-3)] px-2 animate-pulse">Working in your workspace…</div>}
              {messages.length <= 1 && (
                <div className="pt-2 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-3)] font-semibold">Try asking</div>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPrompts.map((prompt) => <button type="button" key={prompt} onClick={() => void respond(prompt)} className="text-[10px] rounded-full border border-[var(--border)] bg-[var(--surface-1)] hover:bg-[var(--surface-3)] text-[var(--text-2)] px-2.5 py-1.5 transition">{prompt}</button>)}
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={(event) => { event.preventDefault(); void respond(draft); }} className="p-3 border-t border-[var(--border)] bg-[var(--surface-2)]">
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-1)] p-1.5 pl-3 focus-within:ring-2 focus-within:ring-[var(--accent)]/30">
                <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask me to do something…" aria-label="Message the assistant" className="min-w-0 flex-1 bg-transparent outline-none text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] py-2" />
                <button type="submit" disabled={!draft.trim() || busy} aria-label="Send message" className="w-9 h-9 rounded-xl btn-accent flex items-center justify-center disabled:opacity-40"><Send className="w-4 h-4" /></button>
              </div>
              <div className="mt-2 px-1 text-[9px] text-[var(--text-3)] flex items-center justify-between"><span>Actions run directly in this app</span><span className="inline-flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> Enter to send</span></div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}
