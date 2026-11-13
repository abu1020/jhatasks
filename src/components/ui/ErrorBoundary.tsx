import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * A stale deploy (cached HTML pointing at replaced /assets hashes), a flaky network, or an
 * aborted dynamic import makes `React.lazy` reject. Without a boundary that error unmounts the
 * whole tree and the user is left staring at a blank page, so we recover automatically and
 * otherwise show a retryable screen instead of white-screening the product.
 */
const CHUNK_LOAD_ERROR =
  /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|dynamically imported module|chunkloaderror/i;

const RETRY_STORAGE_KEY = 'cadence:chunk-recovery-at';
const RETRY_WINDOW_MS = 15_000;

function recoverFromChunkError(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const previous = Number(window.sessionStorage.getItem(RETRY_STORAGE_KEY) || 0);
    const now = Date.now();
    // Only ever reload once per short window, otherwise a genuinely broken build would loop.
    if (previous && now - previous < RETRY_WINDOW_MS) return false;
    window.sessionStorage.setItem(RETRY_STORAGE_KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Rendered instead of the default screen; use `null` to hide the boundary output. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Changes to this value clear the error (e.g. when the user switches views). */
  resetKey?: string | number | null;
  label?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[Cadence] Recovered from a rendering error.', error, info.componentStack);
    if (CHUNK_LOAD_ERROR.test(error?.message || '')) {
      recoverFromChunkError();
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return <ErrorScreen error={error} onRetry={this.reset} label={this.props.label} />;
  }
}

export function ErrorScreen({
  error,
  onRetry,
  label,
}: {
  error: Error;
  onRetry: () => void;
  label?: string;
}) {
  const isChunk = CHUNK_LOAD_ERROR.test(error?.message || '');
  return (
    <div
      role="alert"
      className="flex min-h-[60vh] w-full items-center justify-center p-6"
      aria-live="assertive"
    >
      <div className="popover-surface w-full max-w-md rounded-2xl border border-[var(--border-strong)] p-6 text-center shadow-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">
            <path
              d="M12 8.5v5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="12" cy="16.75" r="1.25" fill="currentColor" />
            <path
              d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-[var(--text-1)]">
          {isChunk ? 'A new version is available' : 'Something went wrong'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-3)]">
          {isChunk
            ? 'Cadence just shipped an update. Reload to load the latest version — your tasks stay safe.'
            : `${label ? `${label} couldn’t load. ` : ''}The rest of the workspace is still usable.`}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-sm font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            Reload app
          </button>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundary;
