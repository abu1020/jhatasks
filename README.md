# Cadence — Focus OS

Cadence is a calm, high-velocity Focus OS for seamless **Personal** and **Office** productivity with deep Google Workspace (Calendar, Gmail, Drive, Google Tasks) and Firebase Firestore synergy.

## Architecture & Highlights
- **Design System**: CSS-first Tailwind v4 tokens (`:root` light and `.dark`), workspace-scoped accents (`.ws-all`, `.ws-office`, `.ws-personal`), Plus Jakarta Sans + Inter typography, tabular numerals (`.tnum`), and opaque `.popover-surface` floating layers.
- **Six Integrated Views** (loaded on demand so the first screen does not download inactive view code):
  1. **My Day**: Unified focus dashboard with shared completion ring formula, streak counter, `"Plan my day"` auto-scheduler (finds free `09:00–18:00` gaps), merged Google Calendar + timed tasks timeline, and right rail.
  2. **Board**: Kanban with `@dnd-kit`, advisory WIP limits (toast + column shake without blocking drops), and `doublePrecision` midpoint `sort_order`.
  3. **List**: Grouped rows (Priority / Due Date / Status), double-click inline title editing, click-to-cycle priority chips, and custom portaled comboboxes.
  4. **Calendar**: Month, Week, and Day modes (`06:00–22:00` at `68px/hr`), 30-minute drop zones, unscheduled backlog tray, all-day row, local collision-cluster overlap layout, and Google Meet event modal.
  5. **Matrix**: Eisenhower 4-quadrant view with explicit `tasks.quadrant` persistence.
  6. **Insights**: Streak, 7-day velocity bar chart, 30-day workspace balance SVG donut, milestone card, and gentle observations.
- **Security**: Local fallback API data is isolated per browser by a random HttpOnly, SameSite session cookie; API writes validate task fields, and cross-origin API requests are rejected. Gmail snippets and OTPs are not cached on the shared server. Firebase Firestore access remains governed by `firestore.rules`.
- **Performance**: Main views, task drawers/composer, integration modals, and Firebase are loaded only when needed. Background Google Sheets sync is debounced, and Gmail polling prevents overlapping requests.
- **Local data note**: The Express fallback store is in memory and is lost when its process restarts. Sign in with Google/Firebase for Firestore-backed task sync across sessions/devices.

## Setup & Commands

```bash
# Install dependencies
npm install

# Push Drizzle PostgreSQL schema (when DATABASE_URL is configured)
npx drizzle-kit push --config=src/db/drizzle.config.ts

# Type-check & lint
npm run lint
npx eslint firestore.rules

# Run unit tests
npm test

# Start development server (Express + Vite on port 3000)
npm run dev

# Build for production
npm run build
```
