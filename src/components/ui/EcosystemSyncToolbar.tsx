import React, { useState } from 'react';
import {
  CheckSquare,
  FileSpreadsheet,
  Mail,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  fetchGmailNotificationsLive,
  fetchGoogleTasksLive,
  googleSignIn,
} from '../../lib/firebase';
import { useCadenceStore } from '../../store/useCadenceStore';

export function EcosystemSyncToolbar() {
  const tasks = useCadenceStore((s) => s.tasks);
  const importTasksBatch = useCadenceStore((s) => s.importTasksBatch);
  const ingestGmailNotifications = useCadenceStore((s) => s.ingestGmailNotifications);
  const setActiveModal = useCadenceStore((s) => s.setActiveModal);
  const addToast = useCadenceStore((s) => s.addToast);
  const userEmail = useCadenceStore((s) => s.userEmail);
  const hasGoogleToken = useCadenceStore((s) => s.hasGoogleToken);
  const setAuthUser = useCadenceStore((s) => s.setAuthUser);

  const [fetchingTasks, setFetchingTasks] = useState(false);
  const [fetchingGmail, setFetchingGmail] = useState(false);

  const handleFetchTasks = async () => {
    setFetchingTasks(true);
    try {
      const maxOrder = tasks.reduce(
        (m, t) => (t.sort_order > m ? t.sort_order : m),
        0
      );
      const pulled = await fetchGoogleTasksLive('@default', maxOrder);
      if (pulled.length > 0) {
        await importTasksBatch(pulled);
        addToast({
          message: `Fetched ${pulled.length} live task${
            pulled.length > 1 ? 's' : ''
          } from Google Tasks API`,
          tone: 'success',
        });
      } else {
        addToast({
          message: 'Connected to Google Tasks API (0 tasks in @default list)',
          tone: 'default',
        });
      }
    } catch (err: any) {
      if (err?.message === 'NEEDS_GOOGLE_AUTH') {
        try {
          const res = await googleSignIn();
          setAuthUser({
            uid: res.user.uid,
            email: res.user.email,
            name: res.user.displayName,
            photo: res.user.photoURL,
            hasToken: Boolean(res.accessToken),
          });
          const maxOrder = tasks.reduce(
            (m, t) => (t.sort_order > m ? t.sort_order : m),
            0
          );
          const pulled = await fetchGoogleTasksLive('@default', maxOrder);
          if (pulled.length > 0) {
            await importTasksBatch(pulled);
            addToast({
              message: `Fetched ${pulled.length} tasks from Google Tasks API`,
              tone: 'success',
            });
          }
        } catch {
          addToast({
            message: 'Sign in with Google Account to fetch live Google Tasks',
            tone: 'warning',
          });
        }
      } else {
        addToast({
          message: 'Opened Google Tasks & Sheets Hub',
          tone: 'default',
        });
        setActiveModal('tasks_io');
      }
    } finally {
      setFetchingTasks(false);
    }
  };

  const handleFetchGmail = async () => {
    setFetchingGmail(true);
    try {
      const items = await fetchGmailNotificationsLive(userEmail);
      const added = ingestGmailNotifications(items, { forceToastNewest: true });
      if (added === 0 && items.length > 0) {
        addToast({
          message: `Fetched live Gmail (${items.length} inbox threads synced)`,
          tone: 'success',
        });
      } else if (items.length === 0) {
        addToast({
          message: 'Connected to live Gmail inbox (0 unread messages found)',
          tone: 'default',
        });
      }
    } catch (err: any) {
      if (err?.message === 'NEEDS_GOOGLE_AUTH') {
        try {
          const res = await googleSignIn();
          setAuthUser({
            uid: res.user.uid,
            email: res.user.email,
            name: res.user.displayName,
            photo: res.user.photoURL,
            hasToken: Boolean(res.accessToken),
          });
          const items = await fetchGmailNotificationsLive(res.user.email);
          ingestGmailNotifications(items, { forceToastNewest: true });
          addToast({
            message: `Fetched ${items.length} Gmail messages`,
            tone: 'success',
          });
        } catch {
          addToast({
            message: 'Sign in with Google Account to fetch live Gmail mail',
            tone: 'warning',
          });
        }
      } else {
        addToast({
          message: 'Opened Gmail Inbox Stream',
          tone: 'default',
        });
        setActiveModal('gmail');
      }
    } finally {
      setFetchingGmail(false);
    }
  };

  return (
    <div className="card p-3 sm:p-3.5 bg-gradient-to-r from-[var(--surface-2)] via-[var(--surface-1)] to-[var(--surface-2)] border border-[var(--border-strong)] flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-[var(--text-1)] whitespace-nowrap">
              Google Ecosystem Live Sync
            </h4>
            {hasGoogleToken && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#10B981]/15 text-[#10B981] text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                ACTIVE
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-3)] truncate">
            Fetch real-time data from Google Tasks and Gmail directly into your Cadence workspace
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {/* Fetch Google Tasks Button */}
        <button
          type="button"
          onClick={() => void handleFetchTasks()}
          disabled={fetchingTasks}
          aria-label="Fetch Google Tasks"
          className="btn-secondary px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 min-h-[36px] bg-[var(--surface-1)] hover:bg-[var(--surface-3)] border border-[var(--border-strong)] cursor-pointer transition"
        >
          {fetchingTasks ? (
            <RefreshCw className="w-3.5 h-3.5 text-[#10B981] animate-spin" />
          ) : (
            <CheckSquare className="w-3.5 h-3.5 text-[#10B981]" />
          )}
          <span>{fetchingTasks ? 'Fetching Tasks...' : 'Fetch Google Tasks'}</span>
        </button>

        {/* Fetch Gmail Mail Button */}
        <button
          type="button"
          onClick={() => void handleFetchGmail()}
          disabled={fetchingGmail}
          aria-label="Fetch Gmail Mail"
          className="btn-secondary px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 min-h-[36px] bg-[var(--surface-1)] hover:bg-[var(--surface-3)] border border-[var(--border-strong)] cursor-pointer transition"
        >
          {fetchingGmail ? (
            <RefreshCw className="w-3.5 h-3.5 text-[#EA4335] animate-spin" />
          ) : (
            <Mail className="w-3.5 h-3.5 text-[#EA4335]" />
          )}
          <span>{fetchingGmail ? 'Fetching Gmail...' : 'Fetch Gmail Mail'}</span>
        </button>

        {/* Google Tasks & Sheets Hub */}
        <button
          type="button"
          onClick={() => setActiveModal('tasks_io')}
          title="Open Google Tasks & Sheets Hub"
          className="p-2 rounded-xl text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--surface-3)] transition border border-[var(--border)]"
        >
          <FileSpreadsheet className="w-4 h-4 text-[#059669]" />
        </button>
      </div>
    </div>
  );
}
