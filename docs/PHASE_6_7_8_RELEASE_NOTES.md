# Kuja v5.6 — Phases 6 + 7 + 8 Release Notes

**Release date:** 15 May 2026
**Scope:** Notifications, reviewer pre-flight, audit-chain UI, report bundles, reviewer follow-ups.

These three phases land together because they're a story arc: **make the AI work for both sides of every transaction**.

---

## Phase 6 — Notifications you can actually use

### NotificationPreference + NotificationDispatcher
- Per-user, per-category channel mix (in-app / email / SMS / WhatsApp / web_push).
- `NotificationDispatcher.dispatch()` is the single fan-out entry point — writes a `Notification` row + dispatches via Twilio for SMS/WhatsApp when configured.
- In-app is always implicit (you can't opt out — that's where the inbox lives).
- Phone numbers per user, opt-in only.

### Pre-emption → dispatcher
- When `CompliancePreemptionService` returns a HIGH-severity finding, the route fires the dispatcher with a 24h per-(user, finding) de-dupe key so refreshing doesn't spam.
- Proof on prod: notification #228 dispatched from a real Claude finding on Amani's overdue maternal-health report, complete with reasoning + recommended action.

### `/settings/notifications` page
- Per-category channel toggles + shared phone/WhatsApp form + per-category "Send test" button.
- Header user menu links to it.

### MyAIUsageCard
- NGOs see their own org's month-to-date AI spend with progress bar + cap remaining. Sits on `/organizations/profile`.

### useDraftAutosave in assessment wizard
- `orgProfile` + `checklistResponses` persist to localStorage per (user × framework).
- "Draft restored from local autosave (Nmin ago)" hint on reopen.

### Tests
- NOTIFPREF-001 + NOTIFPREF-002 → 55 / 55 pass

---

## Phase 7 — Pre-flight + audit chain

### Donor-perspective pre-flight
- NGO clicks "Pre-flight as reviewer" on a draft application/report → Claude scores it the way a reviewer will, then returns per-criterion `predicted_score` + `what_works` + `what_a_reviewer_will_flag` + `concrete_fix`.
- Top 3 fixes ranked by leverage (high / medium / low) — these are the edits that move the predicted overall most.
- Heuristic word-count fallback always available; AI ENRICHES it when available so the UI never goes blank.
- Cached 10 min per application_id so iterating on a draft doesn't burn AI tokens.
- Live on prod: application 469 → predicted 0/100 [thin] with calibrated diagnosis "No response has been provided for the single required criterion. The response field is completely empty despite targeting approximately 500 words."

### Hash-chained audit log visualization
- `/admin/audit-chain` page — chain-intact badge (or break detail), paginated table with seq + action + actor + subject + prev_hash + payload_hash + timestamp.
- One-click re-verify recomputes every row's hash and surfaces the break point if one exists.
- Live on prod: 2 entries (passport publish + verify), chain ok.

### Tests
- PREFLIGHT-001, AUDIT-001, AUDIT-002 → 58 / 58 pass

---

## Phase 8 — Bundles + reviewer follow-ups

### Report bundles (the donor-review deliverable)
NGO program officers spend 8 hours assembling a Q3 review. Kuja now does it in one click.

`ReportBundleService.assemble()` builds a frozen snapshot:
- `cover_meta` (org/grant/period/status)
- `executive_summary` — AI-generated paragraph
- `narrative_sections` (report content)
- `indicators` (pulled from `grant.reporting_requirements` + matched against narrative keys for current vs target)
- `attachments` (Documents on the underlying application + report.attachments)
- `asks` / `risks` / `decisions` (StatusSignal rows on this report)
- `trust_snapshot` (TrustProfileService composite at this moment)
- `compliance_score` + `risk_flags` (from `report.ai_analysis`)
- `bundle_hash` — SHA256 of canonical payload — anchor for proof

`.publish()` writes an `AuditChainEntry` so the bundle hash is tamper-evident. Donors can later prove what they reviewed and NGOs can prove what they sent.

Routes: `GET /api/reports/<id>/bundle` (assemble), `POST /api/reports/<id>/bundle/publish` (NGO/admin only).

Frontend `ReportBundlePanel` lives in expanded report rows on `/reports`. Per-user `canPublish` via `BundleWrap`. Copy-bundle-hash affordance + "Publish (audit anchor)" button.

### Reviewer follow-up questions (donor-side AI)
`ReviewerFollowupsService.for_application()` reads the submission + criteria and proposes 3-4 questions the reviewer should ask BEFORE deciding:
- `question` (verbatim — ask as-is)
- `why_it_matters` (one sentence resolution)
- `what_strong_answer_looks_like` (calibration hint)
- `covers_criterion` (criterion key)

Discipline in the prompt: be specific, don't ask what the text already answers, prioritise questions that change the decision.

Routes: `GET /api/reviewer/followups/application/<id>`, `GET /api/reviewer/followups/report/<id>`.

`ReviewerFollowupsPanel` — per-question Copy button. Gated to donor/reviewer/admin on the application detail page via `ReviewerFollowupsGate`.

### Tests
- BUNDLE-001, FOLLOWUPS-001 → 60 / 60 pass

---

## End-to-end story

```
NGO drafts a report
  → Pre-flight (Phase 7) — see how the reviewer will score it; fix the weak spots
  → Submit + assemble bundle (Phase 8) — one shareable artifact
  → Publish bundle (Phase 8) — anchors hash to audit chain (Phase 7 UI)
  → Donor reviews
    → Reviewer follow-ups (Phase 8) — Claude suggests the 3 most important questions to ask
    → If HIGH-severity slip predicted (Phase 3) → NGO + donor get pinged on their channels (Phase 6)
```

Every step is auditable. Every AI surface has a fallback. Every notification respects user prefs.

## Migration notes

- `notification_preferences` table — created automatically on app startup via `db.create_all()`. No manual SQL.
- No schema changes in Phase 7 or 8 — both use existing tables (`AuditChainEntry`, `Application`, `Report`, `StatusSignal`, `Document`).

## What's deferred

- **Document smart search** (Postgres FTS) — non-trivial migration with a tsvector column + GIN index. Deserves its own iteration with proper indexing strategy.
- **Cross-grant patterns AI** — would need labelled "what made these applications succeed" data; currently sparse.
- **Reviewer side-by-side comparison enhanced** — current single-app review flow is well-served by follow-ups; comparison view comes when donors have a real evaluation backlog.

## How to demo

1. **Pre-flight:** as Fatima on `/applications/469` → "Pre-flight as reviewer" → see the per-criterion verdict + top fixes.
2. **Reviewer follow-ups:** as Sarah (donor) on `/applications/469` → scroll to "Decision-unlocking questions" → "Suggest follow-ups" → 3 Claude-calibrated questions appear with copy buttons.
3. **Bundle:** as Fatima on `/reports` → expand a report row → "Assemble bundle" → see cover + AI exec summary + indicators + attachments + asks/risks/decisions + trust snapshot. "Publish (audit anchor)" writes to the chain.
4. **Audit chain:** as admin → sidebar → "Audit chain" → chain-intact badge + recent entries (including the bundle publish from step 3).
5. **Notifications:** as Fatima → header menu → "Notification settings" → enable SMS for compliance → "Send test" → confirms fan-out via log fallback (Twilio adapter ready when env vars are set).
