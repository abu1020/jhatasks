import React, { useCallback, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  FileJson,
  FileSpreadsheet,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  Moon,
  Sliders,
  Sparkles,
  Sun,
  User,
  X,
} from 'lucide-react';
import {
  useCadenceStore,
  type CustomizationPlanId,
} from '../../store/useCadenceStore';
import { parseTaskInput } from '../../lib/nlpParser';
import { googleSignIn, guestSignIn, logout } from '../../lib/firebase';
import type { ViewId } from '../../db/schema';

interface PrimaryContrastTier {
  id: 'free' | 'yearly_499' | 'lifetime_3999';
  tierOverline: string;
  name: string;
  priceDisplay: string;
  unitLabel: string;
  subPriceNote: string;
  summary: string;
  ctaLabel: string;
  visualVariant: 'free_surface' | 'yearly_spotlight' | 'lifetime_signature';
  features: string[];
}

const CONTRAST_PRICING_TIERS: PrimaryContrastTier[] = [
  {
    id: 'free',
    tierOverline: '100% Free Forever · Core Focus OS',
    name: 'Free Tier',
    priceDisplay: '₹0',
    unitLabel: '/ forever',
    subPriceNote: 'No credit card required · Zero feature paywalls',
    summary:
      'Every core productivity view, Google Tasks v1 importer, Google Sheets sync, and live Gmail OTP notification system is free forever.',
    ctaLabel: 'Start for Free',
    visualVariant: 'free_surface',
    features: [
      'All 6 views: My Day, Kanban Board, List, Calendar, Matrix & Insights',
      'Google Tasks v1 JSON file importer & live Google Tasks API sync',
      'Bidirectional Google Sheets sync & live =IMPORTDATA() CSV feed',
      'Real-time Gmail polling (15s) with 1-click OTP copy toasts',
      'Natural language task parser (#office, !urgent, tomorrow at 3pm)',
      'Global Pomodoro focus timer & collision-free auto-scheduler',
    ],
  },
  {
    id: 'yearly_499',
    tierOverline: 'Most Popular · Save 58% vs ₹99/mo',
    name: 'Yearly Customization',
    priceDisplay: '₹499',
    unitLabel: '/ year',
    subPriceNote: 'Equivalent to ₹41/month · Or choose ₹99/month below',
    summary:
      'Annual workflow customization for professionals and teams who want custom Kanban WIP rules, custom shortcuts, and 24-hour priority tailoring.',
    ctaLabel: 'Choose ₹499 Yearly Plan',
    visualVariant: 'yearly_spotlight',
    features: [
      'Everything in Free Tier + Monthly (₹99/mo) Customizations',
      'Custom Kanban board WIP limits & column thresholds per workspace',
      'Custom Pomodoro focus & restorative break cadence intervals',
      'Custom Google Sheets tab naming & custom column export mapping',
      'Custom Eisenhower Matrix urgency & importance scoring rules',
      'Priority engineering customization queue (24-hour turnaround)',
    ],
  },
  {
    id: 'lifetime_3999',
    tierOverline: 'Best Value · Save Over ₹7,881+ (66% Discount)',
    name: 'Lifetime Customization',
    priceDisplay: '₹3,999',
    unitLabel: 'one-time lifetime',
    subPriceNote: 'Save ₹7,881+ over 10 yrs vs monthly plans (₹11,880) · No renewals',
    summary:
      'Pay ₹3,999 once and save over ₹7,881+ compared to ongoing monthly passes. Own unlimited lifetime bespoke UI components, Google Apps Script pipelines, and custom importers forever with zero renewal fees.',
    ctaLabel: 'Unlock ₹3,999 Lifetime Pass (Save ₹7,881+)',
    visualVariant: 'lifetime_signature',
    features: [
      'Save over ₹7,881+ in 10 years compared to monthly subscriptions (66% discount)',
      'Everything in Yearly Customization unlocked forever with zero renewal fees',
      'Unlimited lifetime bespoke UI & workflow customizations on request',
      'Custom Google Apps Script & automated Google Sheet pipelines',
      'Custom JSON, CSV & enterprise ERP task schema importers',
      'Custom Gmail OTP & VIP sender notification filter rules',
      'Dedicated Principal Architect workflow review & onboarding setup',
    ],
  },
];

const TIER_COMPARISON_ROWS = [
  {
    capability: '6 Core Views + Google Tasks v1 + Sheets + Gmail OTP Toasts',
    free: 'Included Free (₹0)',
    yearly: 'Included Free (₹0)',
    lifetime: 'Included Free (₹0)',
  },
  {
    capability: 'Custom Pomodoro Cadence & Custom Google Sheet Tab Mapping',
    free: 'Standard defaults',
    yearly: 'Included (plus ₹99/mo option)',
    lifetime: 'Unlimited custom profiles',
  },
  {
    capability: 'Custom Kanban WIP Limits, Shortcuts & Matrix Scoring Rules',
    free: 'Standard defaults',
    yearly: 'Included in ₹499/yr',
    lifetime: 'Included forever',
  },
  {
    capability: 'Bespoke UI Components, Apps Script Pipelines & Custom Importers',
    free: '—',
    yearly: 'Priority 24h queue',
    lifetime: 'Unlimited lifetime builds',
  },
];

export function LandingWebsite() {
  const setShowLandingPage = useCadenceStore((s) => s.setShowLandingPage);
  const setActiveView = useCadenceStore((s) => s.setActiveView);
  const setActiveModal = useCadenceStore((s) => s.setActiveModal);
  const openComposer = useCadenceStore((s) => s.openComposer);
  const theme = useCadenceStore((s) => s.theme);
  const toggleTheme = useCadenceStore((s) => s.toggleTheme);
  const workspace = useCadenceStore((s) => s.workspace);
  const setWorkspace = useCadenceStore((s) => s.setWorkspace);
  const customizationPlan = useCadenceStore((s) => s.customizationPlan);
  const customizationConfig = useCadenceStore((s) => s.customizationConfig);
  const updateCustomizationPlan = useCadenceStore((s) => s.updateCustomizationPlan);
  const addToast = useCadenceStore((s) => s.addToast);
  const createTask = useCadenceStore((s) => s.createTask);

  // Auth state
  const userEmail = useCadenceStore((s) => s.userEmail);
  const userName = useCadenceStore((s) => s.userName);
  const userPhoto = useCadenceStore((s) => s.userPhoto);
  const setAuthUser = useCadenceStore((s) => s.setAuthUser);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Interactive Hero Preview state
  const [heroTab, setHeroTab] = useState<'my_day' | 'google_sync' | 'gmail_otp'>('my_day');
  const [liveNlpSample, setLiveNlpSample] = useState(
    'Prepare Q4 Board Deck #office !urgent tomorrow at 10:30am for 45m'
  );

  // Interactive Customization Studio form state
  const [selectedPlan, setSelectedPlan] = useState<CustomizationPlanId>(
    customizationPlan === 'free' ? 'lifetime_3999' : customizationPlan
  );
  const [orgName, setOrgName] = useState(
    customizationConfig.organizationName || ''
  );
  const [emailInput, setEmailInput] = useState(userEmail || '');
  const [focusMins, setFocusMins] = useState<number>(
    customizationConfig.focusDurationMinutes || 25
  );
  const [breakMins, setBreakMins] = useState<number>(
    customizationConfig.breakDurationMinutes || 5
  );
  const [sheetName, setSheetName] = useState(
    customizationConfig.customSheetName || 'Cadence Master Tasks'
  );
  const [customNotes, setCustomNotes] = useState(
    customizationConfig.customRequirements || ''
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedPlan, setSubmittedPlan] = useState<CustomizationPlanId | null>(null);

  // Memoize NLP parsing for fast typing responsiveness
  const parsedPreview = useMemo(
    () => parseTaskInput(liveNlpSample),
    [liveNlpSample]
  );

  const handleLaunchWorkspace = useCallback(
    (targetView?: ViewId) => {
      if (targetView) {
        setActiveView(targetView);
      }
      setShowLandingPage(false);
    },
    [setActiveView, setShowLandingPage]
  );

  const handleStartForFree = useCallback(() => {
    updateCustomizationPlan('free');
    addToast({
      message: 'Started for Free (₹0 Forever). Welcome to Cadence!',
      tone: 'success',
    });
    setShowLandingPage(false);
  }, [updateCustomizationPlan, addToast, setShowLandingPage]);

  const handleCreateNlpTaskAndLaunch = useCallback(async () => {
    if (!liveNlpSample.trim()) {
      handleLaunchWorkspace('my_day');
      return;
    }
    try {
      const parsed = parseTaskInput(liveNlpSample);
      await createTask({
        title: parsed.cleanTitle || liveNlpSample.trim(),
        workspace: parsed.workspace ?? (workspace === 'personal' ? 'personal' : 'office'),
        priority: parsed.priority ?? 3,
        important: parsed.priority === 1 || parsed.priority === 2,
        due_date: parsed.due_date,
        due_time: parsed.due_time,
        recurrence: parsed.recurrence,
        estimated_minutes: parsed.estimated_minutes,
        tags: parsed.tags,
        source: 'quick-add',
      });
      addToast({
        message: `Task "${parsed.cleanTitle}" created! Opening your workspace...`,
        tone: 'success',
      });
      setShowLandingPage(false);
      setActiveView('my_day');
    } catch {
      setShowLandingPage(false);
      openComposer({ initialTitle: liveNlpSample });
    }
  }, [liveNlpSample, createTask, workspace, addToast, setShowLandingPage, setActiveView, openComposer, handleLaunchWorkspace]);

  const handleSelectTier = useCallback(
    (tierId: CustomizationPlanId) => {
      if (tierId === 'free') {
        handleStartForFree();
        return;
      }
      setSelectedPlan(tierId);
      const el = document.getElementById('customizations');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    },
    [handleStartForFree]
  );

  const handleGoogleAuth = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      setAuthUser({
        uid: res.user.uid,
        email: res.user.email,
        name: res.user.displayName,
        photo: res.user.photoURL,
        hasToken: Boolean(res.accessToken),
      });
      addToast({
        message: `Signed in as ${res.user.displayName || res.user.email}. Full software access unlocked!`,
        tone: 'success',
      });
      setAuthModalOpen(false);
      setShowLandingPage(false);
      setActiveView('my_day');
    } catch (err: any) {
      setAuthError(
        err?.isUnauthorizedDomain
          ? 'Google sign-in is unavailable for this domain. Continue as a guest or configure Firebase authorized domains.'
          : err?.isPopupBlocked
          ? 'Google sign-in popup was blocked. Continue as a guest or allow popups.'
          : err?.message || 'Google sign-in could not be completed.'
      );
    } finally {
      setAuthBusy(false);
    }
  };

  const handleGuestAuth = () => {
    const res = guestSignIn();
    setAuthUser({
      uid: res.user.uid,
      email: null,
      name: res.user.displayName,
      photo: null,
      hasToken: false,
    });
    addToast({
      message: 'Guest workspace opened. Changes stay in this browser session.',
      tone: 'success',
    });
    setAuthModalOpen(false);
    setShowLandingPage(false);
    setActiveView('my_day');
  };

  const handleSignOut = async () => {
    await logout();
    setAuthUser({ uid: null, email: null, name: null, photo: null, hasToken: false });
    addToast({ message: 'Signed out of Cadence account', tone: 'default' });
  };

  const handleActivateCustomization = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      if (selectedPlan !== 'free' && emailInput.trim()) {
        const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim());
        if (!validEmail) {
          setFormError('Please enter a valid email address.');
          return;
        }
      }

      updateCustomizationPlan(selectedPlan, {
        organizationName: orgName.trim(),
        focusDurationMinutes: focusMins,
        breakDurationMinutes: breakMins,
        customSheetName: sheetName.trim() || 'Cadence Master Tasks',
        customRequirements: customNotes.trim(),
      });

      const planNames: Record<CustomizationPlanId, string> = {
        free: 'Free Forever (₹0)',
        monthly_99: 'Monthly Customization (₹99/mo)',
        yearly_499: 'Yearly Customization (₹499/yr)',
        lifetime_3999: 'Lifetime Customization (₹3,999)',
      };

      setSubmittedPlan(selectedPlan);
      addToast({
        message: `Activated ${planNames[selectedPlan]} (${focusMins}m/${breakMins}m focus sprint)`,
        tone: 'success',
      });
    },
    [selectedPlan, emailInput, orgName, focusMins, breakMins, sheetName, customNotes, updateCustomizationPlan, addToast]
  );

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text-1)] relative z-10">
      {/* 1. COMPACT 3-ZONE TOP BAR WITH AUTH & CTAS */}
      <header className="sticky top-0 z-40 glass border-b border-[var(--border)]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
          {/* Zone 1: Single text element Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="font-display text-base sm:text-lg font-bold tracking-tight text-[var(--text-1)] whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-4 h-4 text-[var(--accent)]" />
            <span>Cadence</span>
          </a>

          {/* Zone 2: 4 concise navigation links */}
          <nav
            aria-label="Primary website navigation"
            className="hidden md:flex items-center gap-6 text-xs sm:text-sm font-medium text-[var(--text-2)]"
          >
            <a
              href="#features"
              className="hover:text-[var(--text-1)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Features
            </a>
            <a
              href="#ecosystem"
              className="hover:text-[var(--text-1)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Google Sync
            </a>
            <a
              href="#pricing"
              className="hover:text-[var(--text-1)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <a
              href="#customizations"
              className="hover:text-[var(--text-1)] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Customizations
            </a>
          </nav>

          {/* Zone 3: Account & Primary CTA actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {userEmail ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLaunchWorkspace('my_day')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--text-1)] hover:border-[var(--accent)] transition"
                  title={`Signed in as ${userEmail}`}
                >
                  {userPhoto ? (
                    <img
                      src={userPhoto}
                      alt={userName || userEmail}
                      className="w-4 h-4 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-3.5 h-3.5 text-[var(--accent)]" />
                  )}
                  <span className="hidden sm:inline font-medium max-w-[120px] truncate">
                    {userName || userEmail}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="btn-ghost p-1.5 rounded-lg text-xs text-[var(--text-3)] hover:text-[#F43F5E]"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="btn-ghost px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-2)] hover:text-[var(--text-1)] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}

            {userEmail ? (
              <button
                type="button"
                onClick={() => handleLaunchWorkspace('my_day')}
                className="btn-accent px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 shadow-sm"
              >
                <span>Open Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartForFree}
                className="btn-accent px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 shadow-sm"
              >
                <span>Start for Free</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* SIGN IN DIALOG */}
      {authModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sign In to Cadence"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 p-5 shadow-2xl space-y-4 text-slate-900 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="space-y-0.5">
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Sign In to Cadence
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Connect Google for cloud sync, or use a temporary guest workspace
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                aria-label="Close sign in modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={authBusy}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1E293B] hover:bg-slate-50 dark:hover:bg-[#283548] text-xs font-semibold text-slate-800 dark:text-slate-100 transition inline-flex items-center justify-center gap-2.5 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                </svg>
                <span>{authBusy ? 'Connecting to Google...' : 'Continue with Google'}</span>
              </button>

              <div className="relative flex items-center justify-center my-1.5">
                <span className="w-full border-t border-slate-200 dark:border-slate-800" />
                <span className="absolute bg-white dark:bg-[#0F172A] px-2 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  or continue without an account
                </span>
              </div>
              <button
                type="button"
                onClick={handleGuestAuth}
                className="w-full py-2.5 px-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 bg-slate-50 dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 transition"
              >
                Continue as guest
              </button>
              <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 text-center">
                Guest workspaces are temporary and are not linked to an email or cloud account.
              </p>

              {authError && (
                <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-[11px] text-red-600 dark:text-red-300">
                  {authError}
                </div>
              )}
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setAuthModalOpen(false);
                  handleStartForFree();
                }}
                className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
              >
                Skip sign in and open Free Workspace →
              </button>
            </div>
          </div>
        </div>
      )}

      <main id="top" className="max-w-[1280px] mx-auto px-4 sm:px-6">
        {/* 2. COMPACT, HIGH-POWER HERO */}
        <section className="pt-6 sm:pt-8 pb-8 border-b border-[var(--border)]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left Column: Proposition, Live Quick NLP Capture & Controls */}
            <div className="lg:col-span-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center flex-wrap gap-2 text-xs font-medium text-[var(--text-3)]">
                  <span>Focus OS</span>
                  <span aria-hidden="true">·</span>
                  <span>Professional Version</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#10B981] font-semibold">
                    Product Developed & Distributed by Jha Solutions
                  </span>
                </div>

                <h1
                  className="font-display font-bold tracking-tight text-[var(--text-1)] leading-[1.12]"
                  style={{
                    fontSize: 'clamp(1.9rem, 3.2vw, 2.75rem)',
                    textWrap: 'balance',
                  }}
                >
                  Every feature is free forever. Pay only for bespoke customizations.
                </h1>

                <p className="text-sm text-[var(--text-2)] leading-relaxed max-w-[58ch]">
                  Cadence unifies your daily timeline, Kanban board, Eisenhower matrix,
                  Google Tasks v1 imports, bidirectional Sheets sync, and live Gmail OTP
                  toasts at <strong className="text-[var(--text-1)]">₹0 forever</strong>.
                  Product Developed & Distributed by <strong className="text-[var(--text-1)]">Jha Solutions</strong>.
                  Paid passes are strictly for tailored customization passes (₹99/mo, ₹499/yr, <strong className="text-[var(--text-1)]">₹3,999 Lifetime — Save ₹7,881+</strong>).
                </p>
              </div>

              {/* High-Power Natural Language Quick Task Input */}
              <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-3)]">
                  <span className="font-semibold text-[var(--text-2)]">
                    Instant Task Capture (Included Free)
                  </span>
                  <span>Type date, time, workspace (#office, !urgent)</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={liveNlpSample}
                    onChange={(e) => setLiveNlpSample(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleCreateNlpTaskAndLaunch();
                      }
                    }}
                    placeholder="e.g., Review project draft #office !urgent tomorrow at 10am"
                    aria-label="Natural language task capture"
                    className="input-base min-w-0 flex-1 px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-1)]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCreateNlpTaskAndLaunch()}
                    className="btn-accent px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                  >
                    <span>Add & Open</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-3)] flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[var(--text-1)] font-medium">
                      {parsedPreview.cleanTitle || 'New task'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Workspace: {parsedPreview.workspace || 'office'}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Priority: {parsedPreview.priority === 1 ? 'Urgent' : parsedPreview.priority === 2 ? 'High' : 'Normal'}
                    </span>
                    {parsedPreview.due_time && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tnum">{parsedPreview.due_time}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* CTAs & Quick Aesthetic Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2.5">
                  {userEmail ? (
                    <button
                      type="button"
                      onClick={() => handleLaunchWorkspace('my_day')}
                      className="btn-accent px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm"
                    >
                      <span>Launch Cadence Workspace</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartForFree}
                      className="btn-accent px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm"
                    >
                      <span>Start for Free</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <a
                    href="#pricing"
                    className="btn-ghost px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-[var(--text-1)] whitespace-nowrap"
                  >
                    View Pricing (₹0 · ₹499 · ₹3,999)
                  </a>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <div
                    className="inline-flex items-center p-0.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]"
                    role="group"
                    aria-label="Workspace mode"
                  >
                    {(['all', 'office', 'personal'] as const).map((ws) => (
                      <button
                        key={ws}
                        type="button"
                        onClick={() => setWorkspace(ws)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium capitalize transition whitespace-nowrap ${
                          workspace === ws
                            ? 'bg-[var(--surface-2)] text-[var(--text-1)] shadow-xs'
                            : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                        }`}
                      >
                        {ws}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="btn-ghost p-1.5 rounded-lg text-xs text-[var(--text-2)] hover:text-[var(--text-1)]"
                    aria-label="Toggle theme"
                  >
                    {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Compact Live Product Preview */}
            <div className="lg:col-span-6">
              <div className="card p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
                  <div className="text-xs font-bold text-[var(--text-1)]">
                    Live Engine Showcase
                  </div>
                  <div
                    className="inline-flex items-center p-0.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]"
                    role="tablist"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={heroTab === 'my_day'}
                      onClick={() => setHeroTab('my_day')}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition whitespace-nowrap ${
                        heroTab === 'my_day'
                          ? 'bg-[var(--surface-2)] text-[var(--text-1)] shadow-xs'
                          : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                      }`}
                    >
                      Timeline & Matrix
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={heroTab === 'google_sync'}
                      onClick={() => setHeroTab('google_sync')}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition whitespace-nowrap ${
                        heroTab === 'google_sync'
                          ? 'bg-[var(--surface-2)] text-[var(--text-1)] shadow-xs'
                          : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                      }`}
                    >
                      Tasks & Sheets
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={heroTab === 'gmail_otp'}
                      onClick={() => setHeroTab('gmail_otp')}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition whitespace-nowrap ${
                        heroTab === 'gmail_otp'
                          ? 'bg-[var(--surface-2)] text-[var(--text-1)] shadow-xs'
                          : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
                      }`}
                    >
                      Gmail OTP
                    </button>
                  </div>
                </div>

                {heroTab === 'my_day' && (
                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border)] flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-[var(--text-1)]">
                          Engineering Architecture Review
                        </div>
                        <div className="text-[11px] text-[var(--text-3)]">
                          09:30 AM · Google Calendar · Google Meet
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-[var(--accent)]">
                        Synced
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border)] flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-[var(--text-1)]">
                          Optimize Workspace Billing & Storage
                        </div>
                        <div className="text-[11px] text-[var(--text-3)]">
                          10:30 AM · 45m focus sprint · Office
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-[#F43F5E]">
                        Urgent
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div className="p-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]">
                        <div className="font-semibold text-[var(--text-1)]">
                          Eisenhower 2×2
                        </div>
                        <p className="text-[10px] text-[var(--text-3)]">
                          Do First, Schedule, Delegate & Eliminate
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-[var(--surface-1)] border border-[var(--border)]">
                        <div className="font-semibold text-[var(--text-1)]">
                          Pomodoro Timer
                        </div>
                        <p className="text-[10px] text-[var(--text-3)]">
                          {focusMins}m focus / {breakMins}m break cadence
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {heroTab === 'google_sync' && (
                  <div className="p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border)] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-1)]">
                        Google Tasks v1 Importer & Sheets
                      </span>
                      <span className="text-[11px] font-mono text-[var(--accent)]">
                        tasks#tasks
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-2)] leading-relaxed">
                      Import Google Tasks v1 JSON files in Settings. Auto-syncs all tasks
                      bidirectionally with Google Sheets with live =IMPORTDATA() CSV endpoint.
                    </p>
                    <div className="pt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowLandingPage(false);
                          setActiveModal('tasks_io');
                        }}
                        className="btn-accent px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <FileJson className="w-3 h-3" />
                        <span>Open Tasks Hub →</span>
                      </button>
                    </div>
                  </div>
                )}

                {heroTab === 'gmail_otp' && (
                  <div className="p-3 rounded-lg bg-[var(--surface-1)] border border-[var(--border)] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-1)]">
                        15s Real-Time Gmail Polling
                      </span>
                      <span className="text-[11px] text-[#10B981] font-semibold">
                        Live Inbox
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--text-2)] leading-relaxed">
                      Automatically detects 4–8 digit verification OTPs from email bodies
                      and surfaces a calm toast with 1-click OTP copy.
                    </p>
                    <div className="pt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowLandingPage(false);
                          setActiveModal('gmail');
                        }}
                        className="btn-ghost px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <Mail className="w-3 h-3" />
                        <span>Open Gmail Center →</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-xs">
                  <span className="text-[var(--text-3)]">
                    All core features free forever
                  </span>
                  <button
                    type="button"
                    onClick={handleStartForFree}
                    className="font-semibold text-[var(--accent)] hover:underline whitespace-nowrap"
                  >
                    Enter Workspace →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Compact 4-Stat Proof Strip */}
          <div className="mt-6 pt-5 border-t border-[var(--border)] grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-0.5">
              <div className="font-display text-xl sm:text-2xl font-bold text-[var(--text-1)] tnum">
                ₹0 Forever
              </div>
              <div className="text-xs font-semibold text-[var(--text-2)]">
                Core Platform
              </div>
              <div className="text-[11px] text-[var(--text-3)]">
                All 6 views & Google integrations
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="font-display text-xl sm:text-2xl font-bold text-[var(--text-1)] tnum">
                ₹99 / mo
              </div>
              <div className="text-xs font-semibold text-[var(--text-2)]">
                Monthly Pass
              </div>
              <div className="text-[11px] text-[var(--text-3)]">
                Custom Pomodoro & Sheets mapping
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="font-display text-xl sm:text-2xl font-bold text-[var(--accent)] tnum">
                ₹499 / yr
              </div>
              <div className="text-xs font-semibold text-[var(--text-2)]">
                Yearly (Save 58%)
              </div>
              <div className="text-[11px] text-[var(--text-3)]">
                Custom WIP limits & priority queue
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="font-display text-xl sm:text-2xl font-bold text-[#10B981] tnum">
                ₹3,999 Once
              </div>
              <div className="text-xs font-semibold text-[var(--text-2)]">
                Lifetime Pass (Save ₹7,881+)
              </div>
              <div className="text-[11px] text-[var(--text-3)]">
                Save 66%+ over 10 yrs vs monthly
              </div>
            </div>
          </div>
        </section>

        {/* 3. COMPACT 4-FEATURE BENTO GRID */}
        <section id="features" className="py-8 border-b border-[var(--border)] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[var(--accent)]">
                Core Capabilities · Included Free (₹0)
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-1)]">
                Six precision views & deep Google Workspace synergy.
              </h2>
            </div>
            <button
              type="button"
              onClick={handleStartForFree}
              className="text-xs font-semibold text-[var(--accent)] hover:underline whitespace-nowrap"
            >
              Start for Free →
            </button>
          </div>

          <div
            id="ecosystem"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
          >
            <div className="card p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[var(--text-1)]">
                  01. Six Focus Views
                </div>
                <p className="text-xs text-[var(--text-2)] leading-relaxed">
                  Timeline with Auto-Scheduler, Kanban with WIP limits, List, Calendar, Matrix & Insights.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleLaunchWorkspace('my_day')}
                className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-1)] text-left w-full"
              >
                Open My Day →
              </button>
            </div>

            <div className="card p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[var(--text-1)]">
                  02. Google Tasks v1 JSON
                </div>
                <p className="text-xs text-[var(--text-2)] leading-relaxed">
                  Import Tasks v1 JSON in Settings with subtask hierarchy, RFC timestamps & links.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowLandingPage(false);
                  setActiveModal('tasks_io');
                }}
                className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--accent)] text-left w-full inline-flex items-center gap-1.5"
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>Tasks Importer →</span>
              </button>
            </div>

            <div className="card p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[var(--text-1)]">
                  03. Google Sheets Sync
                </div>
                <p className="text-xs text-[var(--text-2)] leading-relaxed">
                  Automatic bidirectional sync on every CRUD edit plus live =IMPORTDATA() CSV endpoint.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowLandingPage(false);
                  setActiveModal('tasks_io');
                }}
                className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--accent)] text-left w-full inline-flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Sheets Hub →</span>
              </button>
            </div>

            <div className="card p-4 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-[var(--text-1)]">
                  04. Real-Time Gmail OTP
                </div>
                <p className="text-xs text-[var(--text-2)] leading-relaxed">
                  15-second background polling detects verification codes with 1-click copy toasts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowLandingPage(false);
                  setActiveModal('gmail');
                }}
                className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--accent)] text-left w-full inline-flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Gmail Alerts →</span>
              </button>
            </div>
          </div>
        </section>

        {/* 4. VISUALLY CONTRASTED PRICING SECTION */}
        <section id="pricing" className="py-8 border-b border-[var(--border)] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-[var(--accent)]">
                Pricing · Free Forever Core OS vs Tailored Customizations
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-1)]">
                Start for Free forever, or unlock Yearly (₹499) & Lifetime (₹3,999) passes.
              </h2>
            </div>
            <button
              type="button"
              onClick={handleStartForFree}
              className="btn-accent px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm"
            >
              <span>Start for Free</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 3-Column Visual Contrast Cards: Free (₹0) vs Yearly (₹499) vs Lifetime (₹3,999) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
            {CONTRAST_PRICING_TIERS.map((tier) => {
              const isCurrent = customizationPlan === tier.id;
              const isFree = tier.visualVariant === 'free_surface';
              const isYearly = tier.visualVariant === 'yearly_spotlight';
              const isLifetime = tier.visualVariant === 'lifetime_signature';

              const cardClasses = isLifetime
                ? 'rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-5 bg-slate-900 dark:bg-indigo-950/90 text-white border-2 border-indigo-400/60 shadow-xl'
                : isYearly
                ? 'rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-5 bg-[var(--surface-2)] text-[var(--text-1)] border-2 border-[var(--accent)] ring-4 ring-[var(--accent)]/10 shadow-lg'
                : 'rounded-2xl p-5 sm:p-6 flex flex-col justify-between space-y-5 bg-[var(--surface-2)] text-[var(--text-1)] border border-[var(--border)] shadow-xs';

              return (
                <div key={tier.id} className={cardClasses}>
                  <div className="space-y-3.5">
                    <div className="space-y-1">
                      <div
                        className={`text-xs font-semibold ${
                          isLifetime
                            ? 'text-indigo-300'
                            : isYearly
                            ? 'text-[var(--accent)]'
                            : 'text-[#10B981]'
                        }`}
                      >
                        {tier.tierOverline}
                      </div>

                      <div className="flex items-baseline justify-between gap-2">
                        <h3
                          className={`font-display text-base sm:text-lg font-bold whitespace-nowrap ${
                            isLifetime ? 'text-white' : 'text-[var(--text-1)]'
                          }`}
                        >
                          {tier.name}
                        </h3>
                        {isCurrent && (
                          <span
                            className={`text-xs font-semibold ${
                              isLifetime ? 'text-indigo-300' : 'text-[var(--accent)]'
                            }`}
                          >
                            Active Tier
                          </span>
                        )}
                      </div>

                      <div className="pt-0.5 flex items-baseline gap-2">
                        <span
                          className={`font-display text-3xl sm:text-4xl font-bold tnum tracking-tight ${
                            isLifetime ? 'text-white' : 'text-[var(--text-1)]'
                          }`}
                        >
                          {tier.priceDisplay}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            isLifetime ? 'text-slate-300' : 'text-[var(--text-3)]'
                          }`}
                        >
                          {tier.unitLabel}
                        </span>
                      </div>

                      <div
                        className={`text-xs ${
                          isLifetime ? 'text-slate-300' : 'text-[var(--text-3)]'
                        }`}
                      >
                        {tier.subPriceNote}
                      </div>
                    </div>

                    <p
                      className={`text-xs leading-relaxed ${
                        isLifetime ? 'text-slate-200' : 'text-[var(--text-2)]'
                      }`}
                    >
                      {tier.summary}
                    </p>

                    <ul
                      className={`space-y-2 pt-3 border-t text-xs ${
                        isLifetime
                          ? 'border-white/15 text-slate-100'
                          : 'border-[var(--border)] text-[var(--text-2)]'
                      }`}
                    >
                      {tier.features.map((feat, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Check
                            className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                              isLifetime
                                ? 'text-indigo-300'
                                : isYearly
                                ? 'text-[var(--accent)]'
                                : 'text-[#10B981]'
                            }`}
                          />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectTier(tier.id)}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${
                      isLifetime
                        ? 'bg-white text-slate-900 hover:bg-indigo-50 shadow-sm'
                        : isYearly
                        ? 'btn-accent'
                        : 'bg-[var(--surface-1)] hover:bg-[var(--surface-3)] text-[var(--text-1)] border border-[var(--border-strong)]'
                    }`}
                  >
                    <span>
                      {isFree
                        ? 'Start for Free'
                        : isCurrent
                        ? `Active: ${tier.name}`
                        : tier.ctaLabel}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Compact Monthly Option Bar */}
          <div className="rounded-2xl bg-[var(--surface-2)] border border-[var(--border)] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--accent)]">
                  Flexible Monthly Option
                </span>
                <span aria-hidden="true" className="text-[var(--text-4)]">
                  ·
                </span>
                <span className="font-bold text-sm text-[var(--text-1)] tnum">
                  ₹99 / month
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-2)]">
                Month-to-month flexibility for custom Pomodoro intervals and custom Google Sheet mapping.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSelectTier('monthly_99')}
              className="btn-ghost px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--text-1)] whitespace-nowrap shrink-0"
            >
              {customizationPlan === 'monthly_99'
                ? 'Active: ₹99 Monthly'
                : 'Select ₹99 Monthly →'}
            </button>
          </div>

          {/* Compact Comparison Matrix */}
          <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-2)]">
                    <th className="py-2.5 px-3.5 font-semibold">Capability</th>
                    <th className="py-2.5 px-3.5 font-semibold tnum">Free (₹0)</th>
                    <th className="py-2.5 px-3.5 font-semibold text-[var(--accent)] tnum">Yearly (₹499)</th>
                    <th className="py-2.5 px-3.5 font-semibold tnum">Lifetime (₹3,999)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {TIER_COMPARISON_ROWS.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[var(--surface-1)]">
                      <td className="py-2 px-3.5 font-medium text-[var(--text-1)]">
                        {row.capability}
                      </td>
                      <td className="py-2 px-3.5 text-[var(--text-2)]">{row.free}</td>
                      <td className="py-2 px-3.5 font-medium text-[var(--text-1)]">{row.yearly}</td>
                      <td className="py-2 px-3.5 font-semibold text-[var(--accent)]">{row.lifetime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 5. COMPACT LIVE CUSTOMIZATION STUDIO */}
        <section id="customizations" className="py-8 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 space-y-3">
              <div className="text-xs font-semibold text-[var(--accent)]">
                Live Customization Studio
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-1)]">
                Tailor your workspace cadence in seconds.
              </h2>
              <p className="text-xs sm:text-sm text-[var(--text-2)] leading-relaxed">
                Configure your custom Pomodoro timer intervals, custom Google Sheet tab
                mapping, and team branding. Changes apply to your workspace instantly.
              </p>
              <div className="p-3.5 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] space-y-1.5 text-xs">
                <div className="font-semibold text-[var(--text-1)]">
                  Plan Summary
                </div>
                <div className="text-[11px] text-[var(--text-2)] space-y-1">
                  <div><strong>₹0 Free:</strong> All core views and Google integrations included.</div>
                  <div><strong>₹99 / mo:</strong> Custom timer intervals and Google Sheet tab naming.</div>
                  <div><strong>₹499 / yr:</strong> Custom Kanban WIP limits and priority 24h queue.</div>
                  <div><strong>₹3,999 Lifetime:</strong> Unlimited bespoke UI and Google Apps Script builds.</div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <form
                onSubmit={handleActivateCustomization}
                className="card p-5 sm:p-6 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                  <div className="text-xs font-bold text-[var(--text-1)]">
                    Workspace Configurator
                  </div>
                  <Sliders className="w-4 h-4 text-[var(--accent)]" />
                </div>

                {/* Plan Tier Selector */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'free', label: 'Free', price: '₹0' },
                      { id: 'monthly_99', label: 'Monthly', price: '₹99/mo' },
                      { id: 'yearly_499', label: 'Yearly', price: '₹499/yr' },
                      { id: 'lifetime_3999', label: 'Lifetime', price: '₹3,999' },
                    ] as { id: CustomizationPlanId; label: string; price: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedPlan(opt.id)}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        selectedPlan === opt.id
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-1)]'
                          : 'border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-2)] hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <div className="text-[11px] font-semibold">{opt.label}</div>
                      <div className="font-display text-xs font-bold text-[var(--text-1)] tnum">
                        {opt.price}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <label htmlFor="custom-org" className="font-semibold text-[var(--text-2)]">
                      Workspace Name
                    </label>
                    <input
                      id="custom-org"
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="e.g., Studio Alpha"
                      className="input-base w-full px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-1)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="custom-email" className="font-semibold text-[var(--text-2)]">
                      Account Email
                    </label>
                    <input
                      id="custom-email"
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="you@domain.com"
                      className="input-base w-full px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-1)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="space-y-1">
                    <label htmlFor="focus-time" className="font-semibold text-[var(--text-2)]">
                      Focus Sprint
                    </label>
                    <select
                      id="focus-time"
                      value={focusMins}
                      onChange={(e) => setFocusMins(Number(e.target.value))}
                      className="input-base w-full px-2 py-1.5 rounded-lg text-xs text-[var(--text-1)]"
                    >
                      <option value={15}>15 minutes</option>
                      <option value={25}>25 minutes (Standard)</option>
                      <option value={45}>45 minutes (Deep)</option>
                      <option value={50}>50 minutes (50/10)</option>
                      <option value={60}>60 minutes (Executive)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="break-time" className="font-semibold text-[var(--text-2)]">
                      Break Duration
                    </label>
                    <select
                      id="break-time"
                      value={breakMins}
                      onChange={(e) => setBreakMins(Number(e.target.value))}
                      className="input-base w-full px-2 py-1.5 rounded-lg text-xs text-[var(--text-1)]"
                    >
                      <option value={5}>5 minutes</option>
                      <option value={10}>10 minutes</option>
                      <option value={15}>15 minutes</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="sheet-tab" className="font-semibold text-[var(--text-2)]">
                      Sheet Tab Name
                    </label>
                    <input
                      id="sheet-tab"
                      type="text"
                      value={sheetName}
                      onChange={(e) => setSheetName(e.target.value)}
                      placeholder="Cadence Master Tasks"
                      className="input-base w-full px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-1)]"
                    />
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <label htmlFor="notes-field" className="font-semibold text-[var(--text-2)]">
                    Custom Requirements (Bespoke UI, OTP Rules, Google Apps Script)
                  </label>
                  <textarea
                    id="notes-field"
                    rows={2}
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    placeholder="Describe any custom columns, automations, or team views..."
                    className="input-base w-full px-2.5 py-1.5 rounded-lg text-xs text-[var(--text-1)] resize-none"
                  />
                </div>

                {formError && (
                  <div className="p-2 rounded-lg bg-[#F43F5E]/10 border border-[#F43F5E]/30 text-xs text-[#F43F5E]">
                    {formError}
                  </div>
                )}

                {submittedPlan && (
                  <div className="p-2.5 rounded-lg bg-[#10B981]/15 border border-[#10B981]/30 text-xs text-[#10B981] flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      <span>Custom profile saved ({focusMins}m/{breakMins}m sprint). Ready in workspace!</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleLaunchWorkspace('my_day')}
                      className="font-bold underline"
                    >
                      Open →
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <button
                    type="submit"
                    className="btn-accent px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap"
                  >
                    Save & Activate
                  </button>
                  <button
                    type="button"
                    onClick={handleStartForFree}
                    className="btn-ghost px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold text-[var(--text-1)] whitespace-nowrap"
                  >
                    Start for Free →
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </main>

      {/* QUIET FOOTER */}
      <footer className="border-t border-[var(--border)] py-6 mt-6">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--text-3)]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-[var(--text-1)]">Cadence</span>
            <span aria-hidden="true">·</span>
            <span>Focus OS Professional Release</span>
            <span aria-hidden="true">·</span>
            <span>Free Forever (₹0) · Customizations ₹99/mo · ₹499/yr · ₹3,999 Lifetime (Save ₹7,881+)</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-[var(--text-1)]">
              Product Developed & Distributed by Jha Solutions
            </span>
          </div>

          <div className="flex items-center gap-4">
            <a href="#features" className="hover:text-[var(--text-1)]">
              Features
            </a>
            <a href="#pricing" className="hover:text-[var(--text-1)]">
              Pricing
            </a>
            <a href="#customizations" className="hover:text-[var(--text-1)]">
              Customizations
            </a>
            <button
              type="button"
              onClick={handleStartForFree}
              className="font-semibold text-[var(--accent)] hover:underline whitespace-nowrap"
            >
              Start for Free →
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
