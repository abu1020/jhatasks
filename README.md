# Cadence — Focus OS

Cadence is a calm, high-velocity Focus OS for seamless **Personal** and **Office** productivity with deep Google Workspace (Calendar, Gmail, Drive, Google Tasks) and Firebase Firestore synergy.

## Architecture & Highlights
- **Design System**: CSS-first Tailwind v4 tokens (`:root` light and `.dark`), workspace-scoped accents (`.ws-all`, `.ws-office`, `.ws-personal`), Plus Jakarta Sans + Inter typography, tabular numerals (`.tnum`), and opaque `.popover-surface` floating layers.
- **Six Integrated Views**:
  1. **My Day**: Unified focus dashboard with shared completion ring formula, streak counter, `"Plan my day"` auto-scheduler (finds free `09:00–18:00` gaps), merged Google Calendar + timed tasks timeline, and right rail.
  2. **Board**: Kanban with `@dnd-kit`, advisory WIP limits (toast + column shake without blocking drops), and `doublePrecision` midpoint `sort_order`.
  3. **List**: Grouped rows (Priority / Due Date / Status), double-click inline title editing, click-to-cycle priority chips, and custom portaled comboboxes.
  4. **Calendar**: Month, Week, and Day modes (`06:00–22:00` at `68px/hr`), 30-minute drop zones, unscheduled backlog tray, all-day row, local collision-cluster overlap layout, and Google Meet event modal.
  5. **Matrix**: Eisenhower 4-quadrant view with explicit `tasks.quadrant` persistence.
  6. **Insights**: Streak, 7-day velocity bar chart, 30-day workspace balance SVG donut, milestone card, and gentle observations.

## Setup & Commands

```bash
# Install dependencies from the lockfile
npm ci

# Push Drizzle PostgreSQL schema (requires DATABASE_URL to be configured)
npx drizzle-kit push --config=src/db/drizzle.config.ts

# Type-check, lint Firestore rules, and run tests/security audit
npm run lint
npx eslint firestore.rules
npm test
npm run security

# Start development server (Express + Vite on port 3000)
npm run dev

# Build for production
npm run build
```

## Data & Security Notes

- Google sign-in is the authenticated account flow. The email-only lookalike login was removed; guest mode is clearly anonymous and does not sync to Firestore.
- Guest API data is isolated by a random `HttpOnly`, `SameSite=Lax` browser-session cookie and held in bounded in-memory stores. It is temporary and is lost on server restart or session eviction; it is not a durable database or an authentication boundary.
- Gmail access tokens are accepted only in the `Authorization: Bearer` header. Gmail message contents and OTPs are returned to the requesting browser and are never cached server-side.
- Firestore access remains governed by `firestore.rules`. Deploy and validate these rules in the Firebase project before relying on cloud storage; the repository's rules test is a lightweight model/static check, not a Firestore Emulator test.
- Configure `DATABASE_URL` explicitly before running Drizzle commands. Never place a development or production database URL in source control.
