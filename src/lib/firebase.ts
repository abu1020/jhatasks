import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { Attachment, CalendarEvent, Task } from '../db/schema';
import { formatLocalDate, getTodayStr } from './dateUtils';
import {
  classifyGmailMessage,
  parseCsvOrTsvToRows,
  parseGoogleTasksV1Json,
  sheetRowsToTasks,
  type GmailNotificationItem,
} from './nlpParser';

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/tasks.readonly',
];

const app = initializeApp(firebaseConfig);
export const db = (firebaseConfig as any).firestoreDatabaseId
  ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}

// Validate connection to Firestore when authenticated
export async function testConnection() {
  if (!auth.currentUser) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore client is currently offline or awaiting network.');
    }
  }
}


export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// In-memory OAuth access token cache (never stored in localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthChange: (user: User | null, accessToken: string | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      onAuthChange(user, cachedAccessToken);
    } else {
      if (!isSigningIn) {
        cachedAccessToken = null;
      }
      onAuthChange(null, null);
    }
  });
};

export interface SignInResult {
  user: {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  };
  accessToken: string | null;
  isLocalFallback?: boolean;
}

export const googleSignIn = async (): Promise<SignInResult> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken || null;
    return {
      user: {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
      },
      accessToken: cachedAccessToken,
    };
  } catch (err: any) {
    const code = err?.code || '';
    const message = err?.message || String(err);
    const isUnauthorizedDomain =
      code === 'auth/unauthorized-domain' ||
      message.includes('unauthorized-domain') ||
      message.includes('authorized domain');
    const isPopupBlocked =
      code === 'auth/popup-blocked' ||
      message.includes('popup-blocked') ||
      message.includes('blocked');

    const enhancedErr: any = new Error(
      isUnauthorizedDomain
        ? 'Preview domain is not yet whitelisted in Firebase Console OAuth settings. Use Quick Sign In below to continue without interruption.'
        : isPopupBlocked
        ? 'Browser blocked the Google sign-in popup. Enable popups or use Quick Sign In.'
        : message.includes('closed')
        ? 'Google sign-in popup was closed before completion.'
        : `Google sign-in error: ${message}`
    );
    enhancedErr.code = code;
    enhancedErr.isUnauthorizedDomain = isUnauthorizedDomain;
    enhancedErr.isPopupBlocked = isPopupBlocked;
    throw enhancedErr;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Direct Email Sign In
 * Allows any user to authenticate with their email address without restrictions.
 */
export const emailSignIn = (
  email: string,
  displayName?: string
): SignInResult => {
  const cleanEmail = (email || '').trim().toLowerCase();
  const name = displayName?.trim() || cleanEmail.split('@')[0] || 'User';
  const safeSeed = encodeURIComponent(name);
  return {
    user: {
      uid: 'user_' + btoa(cleanEmail || 'anonymous').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24),
      email: cleanEmail,
      displayName: name,
      photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${safeSeed}&backgroundColor=4f46e5&textColor=ffffff`,
    },
    accessToken: null,
    isLocalFallback: true,
  };
};

export const quickLocalSignIn = (
  email = 'user@example.com',
  displayName = 'User'
): SignInResult => emailSignIn(email, displayName);

export const getAccessToken = (): string | null => cachedAccessToken;

export const logout = async () => {
  try {
    await auth.signOut();
  } catch {
    // Ignore sign-out errors on local sessions
  }
  cachedAccessToken = null;
};


// Sanitize task payload to adhere to firebase-blueprint.json bounds
function sanitizeTaskForFirestore(task: Task, uid: string) {
  return {
    id: task.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128),
    ownerId: uid,
    title: (task.title || 'Untitled task').slice(0, 500),
    description: (task.description || '').slice(0, 10000),
    workspace: task.workspace === 'personal' ? 'personal' : 'office',
    status: ['todo', 'in_progress', 'in_review', 'done'].includes(task.status) ? task.status : 'todo',
    priority: Math.max(1, Math.min(4, Math.round(task.priority || 4))),
    important: Boolean(task.important),
    quadrant: task.quadrant ? String(task.quadrant).slice(0, 32) : null,
    due_date: task.due_date ? String(task.due_date).slice(0, 32) : null,
    due_time: task.due_time ? String(task.due_time).slice(0, 16) : null,
    tags: (task.tags || []).slice(0, 20).map((t) => String(t).slice(0, 64)),
    subtasks: (task.subtasks || []).slice(0, 50).map((s) => ({
      id: String(s.id).slice(0, 64),
      title: String(s.title).slice(0, 300),
      done: Boolean(s.done),
    })),
    attachments: (task.attachments || []).slice(0, 20).map((a) => ({
      id: String(a.id).slice(0, 64),
      kind: a.kind,
      name: String(a.name).slice(0, 300),
      url: String(a.url).slice(0, 500),
    })),
    recurrence: task.recurrence ? String(task.recurrence).slice(0, 32) : null,
    estimated_minutes:
      typeof task.estimated_minutes === 'number'
        ? Math.max(0, Math.min(10080, Math.round(task.estimated_minutes)))
        : null,
    actual_minutes: Math.max(0, Math.min(100000, Math.round(task.actual_minutes || 0))),
    sort_order: Number(task.sort_order) || 0,
    source: ['manual', 'gmail', 'google-tasks', 'quick-add'].includes(task.source)
      ? task.source
      : 'manual',
    created_at: String(task.created_at || new Date().toISOString()).slice(0, 64),
    completed_at: task.completed_at ? String(task.completed_at).slice(0, 64) : null,
  };
}

export async function fetchFirestoreUserTasksAndEvents(
  uid: string
): Promise<{ tasks: Task[]; events: CalendarEvent[] }> {
  const tasksPath = `users/${uid}/tasks`;
  const eventsPath = `users/${uid}/events`;
  let loadedTasks: Task[] = [];
  let loadedEvents: CalendarEvent[] = [];

  try {
    const tasksSnap = await getDocs(
      query(collection(db, tasksPath), where('ownerId', '==', uid))
    );
    loadedTasks = tasksSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id,
        title: data.title,
        description: data.description || '',
        workspace: data.workspace || 'office',
        status: data.status || 'todo',
        priority: data.priority || 4,
        important: Boolean(data.important),
        quadrant: data.quadrant || null,
        due_date: data.due_date || null,
        due_time: data.due_time || null,
        tags: Array.isArray(data.tags) ? data.tags : [],
        subtasks: Array.isArray(data.subtasks) ? data.subtasks : [],
        attachments: Array.isArray(data.attachments) ? data.attachments : [],
        recurrence: data.recurrence || null,
        estimated_minutes: data.estimated_minutes ?? null,
        actual_minutes: data.actual_minutes || 0,
        sort_order: Number(data.sort_order) || 0,
        source: data.source || 'manual',
        created_at: data.created_at || new Date().toISOString(),
        completed_at: data.completed_at || null,
      } satisfies Task;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, tasksPath);
  }

  try {
    const eventsSnap = await getDocs(
      query(collection(db, eventsPath), where('ownerId', '==', uid))
    );
    loadedEvents = eventsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: data.id,
        title: data.title,
        date: data.date,
        start_time: data.start_time,
        end_time: data.end_time,
        source: data.source || 'google',
        color: data.color || null,
        meet_link: data.meet_link || null,
        location: data.location || null,
      } satisfies CalendarEvent;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, eventsPath);
  }

  return { tasks: loadedTasks, events: loadedEvents };
}

export async function createTasksInFirestore(tasksToCreate: Task[], uid: string) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const batch = writeBatch(db);
  for (const t of tasksToCreate) {
    const clean = sanitizeTaskForFirestore(t, uid);
    const ref = doc(db, `users/${uid}/tasks/${clean.id}`);
    batch.set(ref, {
      ...clean,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${uid}/tasks`);
  }
}

export async function updateTaskInFirestore(task: Task, uid: string) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const clean = sanitizeTaskForFirestore(task, uid);
  const path = `users/${uid}/tasks/${clean.id}`;
  try {
    await setDoc(
      doc(db, path),
      {
        ...clean,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function removeTaskFromFirestore(taskId: string, uid: string) {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const cleanId = taskId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const path = `users/${uid}/tasks/${cleanId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// Google Workspace Live API Helpers (using in-memory OAuth token)
export async function fetchGoogleCalendarLiveEvents(): Promise<CalendarEvent[]> {
  const token = getAccessToken();
  if (!token) throw new Error('NEEDS_GOOGLE_AUTH');

  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(
    timeMin
  )}&timeMax=${encodeURIComponent(timeMax)}&maxResults=50`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Calendar API returned ${res.status}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];

  return items.map((item: any, idx: number): CalendarEvent => {
    const startRaw: string = item.start?.dateTime || item.start?.date || new Date().toISOString();
    const endRaw: string = item.end?.dateTime || item.end?.date || startRaw;
    const startDate = new Date(startRaw);
    const endDate = new Date(endRaw);

    const startH = String(startDate.getHours()).padStart(2, '0');
    const startM = String(startDate.getMinutes()).padStart(2, '0');
    const endH = String(endDate.getHours()).padStart(2, '0');
    const endM = String(endDate.getMinutes()).padStart(2, '0');

    return {
      id: String(item.id || `gcal_${idx}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100),
      title: item.summary || 'Busy',
      date: item.start?.date || formatLocalDate(startDate) || getTodayStr(),
      start_time: item.start?.date ? '09:00' : `${startH}:${startM}`,
      end_time: item.end?.date ? '10:00' : `${endH}:${endM}`,
      source: 'google',
      color: '#4F46E5',
      meet_link: item.hangoutLink || null,
      location: item.location || null,
    };
  });
}

export interface GmailCandidateMessage {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  bodyText?: string;
  isUnread?: boolean;
  internalDate?: number | string;
}

function decodeBase64UrlBrowser(data?: string): string {
  if (!data) return '';
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
    const bin = atob(base64 + pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

function extractBodyTextBrowser(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64UrlBrowser(payload.body.data);
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64UrlBrowser(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const nested = extractBodyTextBrowser(part);
      if (nested) return nested;
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64UrlBrowser(part.body.data)
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
  }
  if (payload.body?.data) {
    return decodeBase64UrlBrowser(payload.body.data)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

export async function fetchGmailStarredOrRecentMessages(
  maxResults = 10
): Promise<GmailCandidateMessage[]> {
  const token = getAccessToken();
  if (!token) throw new Error('NEEDS_GOOGLE_AUTH');

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=in:inbox`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (listRes.status === 401 || listRes.status === 403) {
    cachedAccessToken = null;
    throw new Error('NEEDS_GOOGLE_AUTH');
  }
  if (!listRes.ok) {
    throw new Error(`Gmail API returned ${listRes.status}`);
  }
  const listData = await listRes.json();
  const messages = Array.isArray(listData.messages)
    ? listData.messages.slice(0, maxResults)
    : [];

  const details = await Promise.all(
    messages.map(async (m: { id: string }) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          m.id
        )}?format=full`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!msgRes.ok) return null;
      const msg = await msgRes.json();
      const headers: { name: string; value: string }[] = msg.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      const labelIds: string[] = Array.isArray(msg.labelIds) ? msg.labelIds : [];
      const isUnread = labelIds.includes('UNREAD');
      const bodyText = extractBodyTextBrowser(msg.payload).slice(0, 1200);

      return {
        id: String(msg.id),
        subject: getHeader('Subject') || '(No subject)',
        from: getHeader('From') || 'Gmail Inbox',
        snippet: msg.snippet || '',
        date: getHeader('Date') || '',
        bodyText,
        isUnread,
        internalDate: msg.internalDate,
      } satisfies GmailCandidateMessage;
    })
  );

  return details.filter((d): d is GmailCandidateMessage => d !== null);
}

export async function fetchGmailNotificationsLive(
  userEmail?: string | null
): Promise<GmailNotificationItem[]> {
  const token = getAccessToken();
  if (!token) throw new Error('NEEDS_GOOGLE_AUTH');

  // 1. Poll via backend Cloud Function / API endpoint (/api/gmail/poll)
  try {
    const emailParam = userEmail ? `?email=${encodeURIComponent(userEmail)}` : '';
    const pollRes = await fetch(`/api/gmail/poll${emailParam}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: userEmail || auth.currentUser?.email || 'default',
        maxResults: 10,
        q: 'in:inbox',
      }),
    });

    if (pollRes.status === 401 || pollRes.status === 403) {
      cachedAccessToken = null;
      throw new Error('NEEDS_GOOGLE_AUTH');
    }

    if (pollRes.ok) {
      const data = await pollRes.json();
      if (Array.isArray(data.messages)) {
        return data.messages;
      }
    }
  } catch (err: any) {
    if (err?.message === 'NEEDS_GOOGLE_AUTH') throw err;
    // Fallback to direct Google Gmail API call below
  }

  // 2. Direct Google Gmail API call
  const messages = await fetchGmailStarredOrRecentMessages(10);
  return messages.map((m) => classifyGmailMessage(m));
}

export async function fetchGoogleDriveRecentFiles(): Promise<Attachment[]> {
  const token = getAccessToken();
  if (!token) throw new Error('NEEDS_GOOGLE_AUTH');

  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?pageSize=12&fields=files(id,name,mimeType,webViewLink)&orderBy=modifiedTime desc',
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Drive API returned ${res.status}`);
  }
  const data = await res.json();
  const files = Array.isArray(data.files) ? data.files : [];

  return files.map((f: any): Attachment => {
    const mime = String(f.mimeType || '');
    let kind: Attachment['kind'] = 'link';
    if (mime.includes('document')) kind = 'doc';
    else if (mime.includes('spreadsheet')) kind = 'sheet';
    else if (mime.includes('presentation')) kind = 'slide';
    else if (mime.includes('pdf')) kind = 'pdf';
    else if (mime.includes('image')) kind = 'image';

    return {
      id: String(f.id || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
      kind,
      name: f.name || 'Drive File',
      url: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
    };
  });
}

/**
 * Google Tasks API v1 Live CRUD Helpers
 * Uses https://www.googleapis.com/auth/tasks and https://www.googleapis.com/auth/tasks.readonly
 */
export interface GoogleTaskListMeta {
  id: string;
  title: string;
  updated?: string;
}

export async function fetchGoogleTaskListsLive(): Promise<GoogleTaskListMeta[]> {
  const token = getAccessToken();
  if (!token) throw new Error('NEEDS_GOOGLE_AUTH');

  const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=20', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Google Tasks Lists API returned ${res.status}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  return items.map((it: any) => ({
    id: String(it.id || '@default'),
    title: String(it.title || 'My Tasks'),
    updated: it.updated,
  }));
}

export async function fetchGoogleTasksLive(
  tasklistId = '@default',
  baseSortOrder = 0
): Promise<Task[]> {
  const token = getAccessToken();
  if (!token) throw new Error('NEEDS_GOOGLE_AUTH');

  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
      tasklistId
    )}/tasks?showCompleted=true&showHidden=true&maxResults=100`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    throw new Error(`Google Tasks API returned ${res.status}`);
  }
  const data = await res.json();
  return parseGoogleTasksV1Json(data, { baseSortOrder });
}

export async function createGoogleTaskLive(
  task: Task,
  tasklistId = '@default'
): Promise<{ id: string; title: string }> {
  const token = getAccessToken();
  if (!token) throw new Error('NEEDS_GOOGLE_AUTH');

  const body: Record<string, any> = {
    title: task.title,
    notes: task.description || '',
    status: task.status === 'done' ? 'completed' : 'needsAction',
  };
  if (task.due_date) {
    body.due = `${task.due_date}T${task.due_time || '00:00'}:00.000Z`;
  }

  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(`Google Tasks CREATE returned ${res.status}`);
  }
  const created = await res.json();
  return { id: String(created.id || task.id), title: String(created.title || task.title) };
}

export async function updateGoogleTaskLive(
  rawTaskId: string,
  task: Partial<Task>,
  tasklistId = '@default'
): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('NEEDS_GOOGLE_AUTH');

  const googleId = rawTaskId.replace(/^gtask_/, '');
  const body: Record<string, any> = { id: googleId };
  if (task.title !== undefined) body.title = task.title;
  if (task.description !== undefined) body.notes = task.description;
  if (task.status !== undefined) {
    body.status = task.status === 'done' ? 'completed' : 'needsAction';
    if (task.status === 'done') {
      body.completed = new Date().toISOString();
    } else {
      body.completed = null;
    }
  }
  if (task.due_date !== undefined) {
    body.due = task.due_date ? `${task.due_date}T00:00:00.000Z` : null;
  }

  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
      tasklistId
    )}/tasks/${encodeURIComponent(googleId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    throw new Error(`Google Tasks PATCH returned ${res.status}`);
  }
}

export async function deleteGoogleTaskLive(
  rawTaskId: string,
  tasklistId = '@default'
): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('NEEDS_GOOGLE_AUTH');

  const googleId = rawTaskId.replace(/^gtask_/, '');
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
      tasklistId
    )}/tasks/${encodeURIComponent(googleId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`Google Tasks DELETE returned ${res.status}`);
  }
}

/**
 * Extracts Google Spreadsheet ID from either a full docs.google.com/spreadsheets/d/<ID> URL or raw ID
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  return trimmed;
}

/**
 * Pulls tasks from a Google Sheet using Drive export (drive.readonly) or backend gviz CSV proxy
 */
export async function pullTasksFromGoogleSheet(
  spreadsheetIdOrUrl: string,
  baseSortOrder = 0
): Promise<Task[]> {
  const sheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  if (!sheetId) throw new Error('Invalid Google Spreadsheet ID or URL');

  const token = getAccessToken();
  if (token) {
    try {
      const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
          sheetId
        )}/export?mimeType=text/csv`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (driveRes.ok) {
        const csvText = await driveRes.text();
        const rows = parseCsvOrTsvToRows(csvText);
        return sheetRowsToTasks(rows, getTodayStr(), baseSortOrder);
      }
    } catch {
      // Fall through to backend proxy
    }
  }

  const proxyRes = await fetch(
    `/api/sheets/sync?spreadsheetId=${encodeURIComponent(sheetId)}`
  );
  if (!proxyRes.ok) {
    throw new Error('Could not read Google Sheet');
  }
  const data = await proxyRes.json();
  if (Array.isArray(data.rows)) {
    return sheetRowsToTasks(data.rows, getTodayStr(), baseSortOrder);
  }
  return [];
}

