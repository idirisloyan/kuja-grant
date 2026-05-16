# Kuja v5.3 — Phase 4 + 5 Release Notes

**Release date:** 15 May 2026
**Phase 4 scope:** "Designed for the Global South" — making the marketing real.
**Phase 5 scope:** Integrity & polish — hard controls finance/compliance teams expect.

---

## Phase 4 — Global South affordances

### 1. Multi-currency support
- New `Organization.preferred_currency` (ISO 4217, default USD). Auto-migration on startup.
- `frontend/src/lib/currency.ts` — Intl.NumberFormat-backed `formatMoney()` + 15-currency picker (USD/EUR/GBP + 12 African/regional).
- Per-currency locale hints (KES→en-KE, XOF→fr-SN, EGP→ar-EG, etc.) so number grouping and symbol placement match the user's locale, not just US conventions.
- Compact mode (`"KSh 1.2M"`) for tight UI on grant cards.
- Wired into grants list + matches card. Org profile page has a currency picker.

### 2. PWA — installable + offline shell
- `frontend/public/manifest.webmanifest` — installable to home screen with app shortcuts (Dashboard / Trust / Calendar).
- Service worker extended: network-first HTML shell with cache fallback + cache-first immutable static chunks. API requests are NEVER cached.
- Version-purge on `activate` prevents stale-cache bugs across builds.
- Registered eagerly in `AppRegistry` (not only on push permission).

### 3. Offline indicator
- `OfflineBanner` component listens to `navigator.onLine` + window `offline`/`online` events.
- Amber banner: "You're offline. Drafts will save locally; new actions will retry when reconnected."
- Green flash: "Back online — refreshing."

### 4. Low-bandwidth mode
- UI store gains `lowBandwidth` + `toggleLowBandwidth`, persisted to localStorage.
- Header toggle (signal-strength icon) visible on tablet+.
- Downstream consumers can `useUIStore(s => s.lowBandwidth)` to defer AI auto-calls, chart-caption fetches, decorative imagery.

### 5. WhatsApp + SMS scaffolding (env-gated)
- `MessagingService` adapter with three channels: log (always works), SMS (Twilio), WhatsApp (Twilio Business).
- `GET /api/messaging/channels` reports wiring status.
- `POST /api/messaging/test` admin-only test sender.
- `compose_deadline_reminder()` helper.
- Channels are wired but no notification call sites are emitting yet — deliberately deferred so the team can pick which signals get SMS/WhatsApp'd first.

### 6. Form draft autosave
- `useDraftAutosave` hook — localStorage form-draft persistence with 600ms debounce.
- Ready to swap into the long forms (assessment wizard, application drafter, report drafter) in a follow-up; doesn't conflict with existing server-side save loops.

---

## Phase 5 — Integrity & polish

### 1. Per-org AI budget gate
- `Organization.ai_monthly_budget_usd NUMERIC(10,2) NULL=unlimited`. Auto-migration on startup.
- `AIBudgetService` — pricing table (Claude Sonnet 4: $3/1M input, $15/1M output), `month_to_date_usd()`, `check_budget()`, `enforce_budget()`, `record_skipped()`.
- Wired into `AIService._call_claude` + `_call_claude_tool` BEFORE every external invocation. Over-budget calls return None gracefully (callers already have template fallbacks) and write a `'budget'` row to `ai_call_logs` so the admin spend report can show what got blocked.
- `admin_spend_report()` — cross-DB-portable SQL, grouped by org, with `pct_used` + `skipped_due_to_budget` counts.

### 2. Admin AI budget UI
- `AIBudgetAdminCard` on the admin dashboard.
- Per-org table: name → spent → budget → usage bar → skipped count → inline editor.
- Inline budget editor (number input, blank = unlimited, saves via PUT).
- Skipped-by-endpoint chips at the bottom.

### Routes
- `GET  /api/ai-budget/me`            — current user's org status (any user)
- `GET  /api/ai-budget/admin/spend`   — full rollup (admin only)
- `PUT  /api/ai-budget/org/<id>`      — set/clear cap (admin only)
- `GET  /api/messaging/channels`      — channel wiring status
- `POST /api/messaging/test`          — test send (admin only)

### 2FA hard-enforce, risk register lifecycle
- Deferred. Existing `TwoFactorNagBanner` + `Risk.status` lifecycle remain advisory. Hard enforcement would force every prod admin to re-enroll mid-session — better landed alongside an explicit team rollout window.

### Demo-readiness scanner
- Already existed (`app/services/demo_readiness.py`) — left alone.

---

## Tests

- **53 / 53 smoke tests pass** (4 new: `MSG-001`, `MSG-002`, `AIBUDGET-001`, `AIBUDGET-002`)
- Logic invariants pass
- End-to-end verified on https://web-production-6f8a.up.railway.app

## Commits

- Phase 4: `83900d2` feat(global-south) + build commit
- Phase 5: `b7022b4` feat(integrity) + build commit
- Migration fix: `ee0b3fe` fix(migration) — committing org column ALTERs that were silently dropped on prod

## Migration notes

- The `preferred_currency` + `ai_monthly_budget_usd` columns are added by `app/__init__.py` on app startup. PostgreSQL only — SQLite (dev) catches via SQLAlchemy's `db.create_all()` for fresh tables.
- If your prod stack was on a Phase 4 deploy where the migration silently dropped (commit `83900d2` ↔ `b7022b4`), the `ee0b3fe` fix completes the migration. Verify with: `SELECT preferred_currency FROM organizations LIMIT 1;` — should return 'USD' for all rows.

## How to demo

1. **Multi-currency:** sign in as NGO, go to `/organizations/profile`, change "Preferred currency" to KES → save → navigate to `/grants` → grant funding figures formatted as KSh.
2. **PWA:** install via browser menu ("Install Kuja"). Disconnect network — open the installed shell, see cached content.
3. **Offline banner:** dev tools → Network → Offline → banner appears. Reconnect → green flash.
4. **Low-bandwidth toggle:** click the signal icon in the header → amber state.
5. **AI budget gate:** as admin, dashboard → AIBudgetAdminCard → set Amani's cap to $0.50 → as Amani, trigger AI (try a draft co-author) → call should be skipped, "skipped due to budget" row appears in admin view.
6. **WhatsApp test:** as admin, `POST /api/messaging/test` with `channel: 'log'` → always succeeds; replace with `sms`/`whatsapp` once Twilio env is set.
