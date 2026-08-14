# Kuja Platform Integration — Specification (v0.2)

**Status:** design, pre-build · **Date:** 2026-08-14 · **Owner:** Kuja platform team
**Visual spec (diagrams):** [`kuja-platform-integration.html`](./kuja-platform-integration.html) — open in a browser, or the live artifact at
<https://claude.ai/code/artifact/2a8650b9-23a9-4703-a6ac-0172a2fab505>

One platform from four products — the **Kuja Link** marketplace, the **Grant** system, the **Trust** due-diligence engine, and the **Build** ERP — joined by one login, one shared organisation, and one due-diligence engine. **NGOs never pay.**

---

## Locked decisions

| Area | Decision |
|---|---|
| Odoo (Kuja Link) | **In-house, full control** — can host a custom module + act as an identity provider |
| Due diligence | **Reuse Trust as the engine** — Grant *calls* the standalone Trust app; no second copy of the logic |
| Licensing | **Lives in the Grant app** — platform admins grant/revoke a donor's licence |
| ERP financials | **Real-time if the customer is on Build; upload reports if not — compliance works either way** |

## The four products

| System | Role | Stack | Owns |
|---|---|---|---|
| **Kuja Link** | The network & marketplace (1,700 NGO members + donors). Identity provider. | Odoo 18 | Members, profiles, billing, matching |
| **Kuja Grant** | Publish/apply/review/award/report/comply. The licensed module (the hub). | Flask + Next static export | Grants, budgets, compliance, reporting |
| **Kuja Trust** | Screening, capacity, the signed Capacity Passport (the engine). | Node/Next + Postgres | Due diligence, scores, credentials |
| **Kuja Build** | Accounting & finance ERP, sold as an upsell (the ledger). | Odoo 18 | Ledger, actuals, disbursements |

- Kuja Link = `kuja.org` (Odoo). Login at `/partners/signin`; members are `res.partner`.
- Kuja Grant = repo `idirisloyan/kuja-grant`; main "Kuja" tenant is the default `Network(slug='kuja', is_default=True)`.
- Kuja Trust = repo `idirisloyan/kuja-trust-passport` (local at `~/kuja-trust-passport-rw`).

---

## Core idea

**Kuja Link (Odoo) owns identity and membership.** Grant, Trust, and Build key off **one shared organisation record** — the Odoo `res.partner` id, stamped onto the Grant `Organization`, the Trust org, and the Build company. A member logs in once at kuja.org; a launcher opens Grant; Grant leans on Trust for due diligence and on Build for live financials.

## Identity & entitlements

- **Shared org identity:** new `Organization.kuja_partner_id` column = the Odoo `res.partner` id (the join key across all four products).
- **Entitlements (per donor org, read by Grant):** `grant_licensed` (may publish & award) and `has_kuja_build` (finance feed available). Source of record = Grant app admin; billing stays in Odoo.
- **Load-bearing rule:** entitlements gate **donor** powers only. Every NGO capability (apply, capacity assessment, Trust Passport, report upload) sits **outside** every entitlement check. NGOs are free by construction, not by policy.

---

## Seam 1 — Link → Grant (SSO + licensed module)

Odoo acts as an **OpenID Connect provider**. A "Grants" tile in the Link portal launches Grant with a signed token — no second password.

1. Member on kuja.org, already signed in; a **Grants** tile appears for every member.
2. Click launches SSO → Odoo redirects to Grant with an OIDC token: identity, email, `partner_id`, role, entitlement claims.
3. Grant **provisions or links** an `Organization` + `User` in the Kuja tenant (match by `partner_id`/email). No signup form.
4. **Entitlement check inside Grant:** licensed donor → full powers; unlicensed → upgrade path; NGO → full free access.
5. Land in the module as the right persona, scoped to their org.

Token claims: `sub`, `email`, `partner_id`, `org_name`, `role`, (optional) `grant_licensed`.

## Seam 2 — Grant → Trust (one due-diligence engine)

**Key finding:** the grant app already carries a **fork of the Trust engine** — same two-pillar model, identical `DD_WEIGHTS`, same worst-pillar reconciliation, same OpenSanctions/SAM/adverse-media/PEP checks, its own Capacity Passport + VC — that has drifted behind. "Reuse Trust" means **Grant calls Trust and we retire the fork.**

- **Grant delegates to Trust:** run screening, compute the two-pillar score, issue/verify the Capacity Passport + credential, evaluate funder policy.
- **Grant keeps:** the mandatory capacity gate on membership, the per-application diligence Q&A room, the reviewer/award flow (reading Trust), grant lifecycle + reporting.
- **Three fork bugs retired on the way out:**
  1. Issued Verifiable Credentials serialise pillar scores as `null` (`vc_service.py` reads keys `trust_profile_service.build` never emits).
  2. `NetworkMembership.is_assessment_fresh()` freshness gate is displayed but never enforced.
  3. A never-screened org and a sanctioned org both score 0 on diligence (Trust already fixes this: no-data ≠ fail).

### Auth bridge (Grant ↔ Trust)
- **Member context:** NGO builds its passport under its own SSO session (same Trust workspace whether reached from Link, Grant, or Trust).
- **Server-to-server:** Grant calls Trust with a **service credential** scoped to the shared org id (extends Trust's existing shared-secret gating — `CRON_SECRET`, `KUJA_GOVERNANCE_KEY`).

## Seam 3 — Build → Grant (ERP financials, the upsell)

When a donor buys Build for themselves **and** their NGO, grant financial actuals feed Grant's compliance & reporting in real time. When they don't, they upload reports — **compliance works the same**. Grant reads one normalised shape whatever the source.

- **Grant-side `financial_source` contract (per grant, or grant × partner):**
  - `financial_source` = `"erp" | "manual"`
  - `build_ref` = analytic account / project id (when erp)
  - normalised rows compliance reads from either source: `budget_lines[]`, `actuals[]`, `disbursements[]`, `last_synced_at`
- **Two channels, kept distinct:**
  - **A (core):** authenticated Build→Grant data feed over a **service credential** — structured financials feed the pipeline.
  - **B (complement):** the dev team's `grant.dashboard.share` public magic-link — for **human** viewers only. Do **not** run channel A over its `auth="none"` token.
- **System of record:** Grant owns grant/budgets/compliance/reporting; Build owns ledger/actuals. Odoo `grant.grant` is a thin finance projection keyed to the Grant-app grant — not a second grant model, and not a place to rebuild dashboards Grant already has.

### On the dev team's Grant Dashboard Sharing spec
Keep: token model (public id + secret, hash-only, constant-time compare), tenant isolation by resolving the grant through the share record, Snapshot/Real-Time split, read-only single-grant scope. Refine: use a service credential for the system-to-system path (not `auth="none"`); keep `grant.grant` a thin finance projection; default a TTL for finance links + add `created_by` and an audit trail.

---

## Security model (cross-cutting)

- **Two credential classes:** humans → Link SSO; systems → scoped service credentials. Public magic-link tokens are for external humans only, never a system channel.
- **Isolation by record, not by URL:** every shared/cross-system lookup resolves through a validated record (share, membership, org link) and never trusts a URL-supplied id.
- **One audit spine:** Grant and Trust both hash-chain audit; the Build feed + every share create/revoke append to it.
- **Least data:** explicit per-audience serializers; store token hashes not raw tokens; financial links carry a TTL.

## Phased roadmap (relative effort S/M/L)

| Phase | Scope | Size |
|---|---|---|
| 0 | Identity foundation — `kuja_partner_id` on `Organization`; Odoo OIDC; map 1,700 members | M |
| 1 | SSO launch + "Grants" tile; auto-provision on first entry | M |
| 2 | Entitlements + licensing toggles (`grant_licensed`, `has_kuja_build`) | S |
| 3 | **Trust delegation — read path** (Grant reads screening/scores/passport from Trust; run both engines in parallel to compare, then switch) | L |
| 4 | Retire the DD fork + fix the 3 bugs | M |
| 5 | Financial-source abstraction (`erp \| manual`); manual/upload path made source-equivalent | M |
| 6 | Build feed (authenticated) + the dashboard-share link (security-reviewed) | L |

Phases 3–4 (Trust consolidation) need **no** Odoo dependency and can run in parallel with the Link/Build work.

## Open questions & what we need

- **Link test env:** URL + admin/donor/NGO logins; OIDC provider on (client id/secret, redirect URIs); the `res.partner` ↔ org model.
- **Build test env:** URL + admin (donor & NGO tenants); finance API creds (XML-RPC/JSON-RPC or REST) + service account; **one sample real-time payload** + the grant ↔ analytic-account mapping.
- **Open:** is the shared dashboard Odoo's own or Grant's fed by Build? Does Build hold a real grant model or only a finance projection? What financial objects at what granularity? Feed = pull-on-view / scheduled / webhook? In Build, separate company per donor+NGO or one DB with record rules?

---

*Related repo docs: [`DESIGN_BACKLOG.md`](./DESIGN_BACKLOG.md), backlog under `docs/BACKLOG.md`. Companion reply to the dev team's dashboard-sharing spec delivered as `Kuja_Grant_Dashboard_Sharing_Response_2026-08-14.docx`.*
