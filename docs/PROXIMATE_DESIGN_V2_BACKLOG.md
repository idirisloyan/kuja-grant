# Proximate Design v2 — Reconciled Backlog

Reconciliation of the team's "UI/UX Redesign Direction" document
(received 20 July 2026) against the live build. This is the working
backlog for the next design wave. Rules that govern all of it:

- **Nothing visible restructures while the UAT is running.** The
  84-case pack and the QA team's scripts are keyed to current screens
  (their second-signature script already broke once on a copy change).
  Phase 1 starts after UAT sign-off.
- **Brand orange is `#FC5810`** (official Proximate palette, per brand
  guide + per-tenant branding shipped 2026-07-16). The design doc's
  "~#DA5A2A" is an approximation — do not "correct" the brand color.
- The doc's five principles (state-before-list, one primary action,
  semantic colour = meaning, progressive disclosure, design for the
  field) are adopted as standing review criteria for every new screen.

---

## A. Already shipped — do NOT rebuild

The design doc was written without full sight of the July redesign
(Stages 1–5 + gap closure, commits `2b79ba4fe` … `356ccf372`). These
doc asks are live; validate against them instead of re-implementing:

| Doc section | Status in live build |
|---|---|
| Semantic status colours, fixed badge vocabulary (§8, tokens) | Shipped Stage 1 — shared tone system, green/amber/blue/red semantics, raw codes eliminated in all 6 locales |
| Humanised labels / no raw codes (§23 partially) | Shipped (Stage 1 + audit label sweep + enum labels) |
| Guided empty states (§19 partially) | Shipped Stage 1 — lists explain what belongs + next step; a residual sweep for long-tail pages remains (Phase 3) |
| Breadcrumbs on detail pages (§5) | Shipped Stage 2 |
| Shareable URL filters (§3/§6) | Shipped Stage 2 (registers) |
| Role-aware navigation (§5) | Shipped — donor/endorser/OB/admin see different navs; partners are token-page only (no sidebar); QA re-verified isolation 2026-07-20 |
| Command palette scoped per tenant (§5) | Shipped Stage 2 |
| Mobile bottom tab bar (§5/§21) | Shipped for OB persona (Home/Rounds/Partners/Disbursements/More) |
| Preference consolidation (§5) | Shipped — /settings hub (language, theme, low-bandwidth, security, notifications) |
| No horizontal scroll, phone + tablet (§21) | Verified 390px ×9 pages + 768/1024 both orientations, 40/40 |
| Dark mode, RTL/Arabic layout (§22) | Shipped + verified (Arabic-default accounts; dir= from user.language) |
| Round lifecycle strip (§12 partially) | Shipped — journey strip + 5-tab round page |
| Partner stages + tabs (§13 partially) | Shipped — Overview/Endorsements/DD/Disbursements tabs, stage auto-compute |
| Confirm step on endorser approval (§7 partially) | Shipped Stage 3c |
| Audit two-level rows + plain-language collapsed view (§18 partially) | Shipped (adcb07591 + subject labels 131044a7d) |

## B. Phase 1 (post-UAT) — genuinely new, highest value

1. **Donor dashboard v2 (§10)** — the funding-renewal view. Hero KPI
   row (committed / allocated / disbursed / verified with serif
   numbers), MoneyFlowBar (Committed→Allocated→Disbursed→Verified),
   disbursement trend, region breakdown, impact strip, verified-reports
   list. All read-only; zero operational chrome; test data never shown.
2. **OB dashboard zones (§4/§11)** — KPI tile row above the existing
   attention inbox (overdue reports / cosigns waiting / open grievances
   / sanctions flags, each tappable to its filtered queue), compact
   donut of disbursements-by-status, 2-week report-deadline workload
   bar, severity-grouped collapsible inbox (Critical expanded), and a
   humanised activity feed (actor + verb + object, seq links to audit).
3. **Report-package review split layout (§14)** — evidence pane left,
   sticky decision rail right (checklist + Verify / Request changes /
   Flag), obligation header pinning the disbursement + amount.
4. **Safeguarding media checklist (§17)** — blocking checklist before
   any media flips donor-visible (consent, minors, location detail);
   locked overlay for pending/rejected media. Extends the existing
   media-verification verdict flow.
5. **Money-action confirm summaries (§7)** — cosign/record/approve
   dialogs state amount + partner + source before commit; N-of-M shown
   on cosign buttons.

Chart implementation guidance: lightweight inline SVG (no heavy chart
lib), max 4 series, semantic colours only, mandatory plain-language
caption, data-table a11y fallback, defer rendering in low-bandwidth
mode.

## C. Phase 2 — core operations polish

6. Header de-clutter (§5): merge AI entry points into one Assistant
   control; theme/language/low-BW already live in /settings — remove
   duplicates from the header, leaving Search · Assistant · Profile.
7. Partners list density (§6): mini stage-track in the empty middle,
   single badge, right chevron.
8. Round detail additions (§12): budget ring (envelope vs disbursed vs
   remaining) + governance panel prominence.
9. Audit chain upgrades (§18): integrity banner ("Chain intact · N
   entries · last verified…"), day-group headers, actor icons, action
   category dots, row-expand hash detail, filter dropdown.
10. One-badge rule sweep (§8): replace residual double-badging
    (status + overdue pill) with inline "· ⚠ n days overdue" meta.

## D. Phase 3 — field & polish

11. Public reporting form pass (§15): chunked steps + progress bar,
    camera-first resumable uploads, safeguarding prompt pre-upload,
    reference-number confirmation. (Token page exists; this is a
    structured upgrade.)
12. PDF inline preview (§16): reader frame + thumbnails + DRAFT
    watermark / Verified ribbon.
13. Skeleton loading states (§20) + labelled progress for PDF/compile.
14. Empty-state long-tail sweep (§19) and microcopy sweep (§23).
15. Accessibility pass (§22): focus rings, chart ARIA fallbacks,
    contrast audit on badges.

## E. Cross-cutting decisions & cautions

- **Hide-test-data (§23):** do NOT default-on globally — the UAT
  depends on UAT-prefixed fixtures being visible to testers. Decision:
  donor-facing views never show test artifacts (largely true already
  via donor round-scoping); an OB-side "hide test data" toggle ships
  default-OFF and flips to default-ON only after post-UAT cleanup
  deletes the UAT fixtures.
- **Signer name resolution (ready to ship, HELD):** the round
  signature roster renders `Signer #<user_id>` (raw ID — violates the
  no-User-#N standard). Fix is prepared: serialise signer email/name in
  the round payload (OB-only surface) and render it in
  `frontend/src/app/(app)/proximate/rounds/[roundId]/client.tsx` (~line
  800). **Deliberately held until the QA team completes their Round 10
  second-signature test** — their paused script guard matches on the
  current "Signer #21/#22" copy. Ship immediately after they confirm
  Round 10 is locked.
- Shipped this wave (2026-07-20, pre-UAT-safe): distinct audit action
  `proximate.payment_confirmation.attached` (+ label + gate pin) and
  the `/api/whats-new` hydration guard (zero digest requests on
  Proximate; Kuja unaffected).
