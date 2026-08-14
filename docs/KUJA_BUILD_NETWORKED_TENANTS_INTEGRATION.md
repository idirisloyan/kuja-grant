# Kuja Build ↔ Networked Tenants — Financial Integration (v0.2)

**Status:** design; **grant-side scaffold (Phases 0–1) built & deployed, inert on prod** · **Date:** 2026-08-14 · **Owner:** Kuja platform team
**In scope:** **Proximate**, **Saxansaxo** (and future networked grant tenants) ↔ **Kuja Build** (Odoo 18 ERP)
**Visual spec (diagrams):** [`kuja-build-networked-tenants-integration.html`](./kuja-build-networked-tenants-integration.html)
**Companion spec:** the four-product [`KUJA_PLATFORM_INTEGRATION.md`](./KUJA_PLATFORM_INTEGRATION.md) is the **Kuja-tenant** spec (Link + Grant + Trust + Build). This document is its **sibling for the non-Kuja network tenants** — a different connection mechanism, and Trust deliberately excluded.

One pattern: a networked grant tenant pulls **real, booked financials for a single donor grant** from the operator's **Kuja Build** ERP over a service credential, and shows them to the donor **scoped to only their grant** — never the operator's other grants from the same donor.

---

## Why this is a separate spec (don't confuse the tenants)

The Kuja-tenant Build seam assumes a **shared Link (Odoo) identity**: the donor signs in through Link and the grant↔Build link is derivable from the shared `res.partner`. **Proximate and Saxansaxo don't use Link.** They:

- authenticate their **own** users (donor logins, partner token-links) — no Odoo SSO;
- do **community-based trust** (endorsements / reputation) — they **never call the Kuja Trust engine**;
- run under their **own network** with per-tenant data isolation.

So the Build connection here needs a mechanism that does **not** depend on Odoo SSO or a shared identity. That mechanism — an **operator-set per-grant mapping** plus a **service-credential feed** — is different enough from the Kuja seam to warrant its own spec, so the two never get conflated.

| | Kuja tenant | **Networked tenants (this spec)** |
|---|---|---|
| Trust | Delegates to the Kuja Trust engine | **None — community-based trust** |
| Human auth | Link (Odoo) SSO | Tenant's own login / token-links |
| Grant ↔ Build link | Auto-derived from shared `res.partner` | **Operator-set `build_ref`** per grant |
| Who runs Build | The **donor** buys Build (upsell) | The **operator (Adeso)** runs Build; donor is a scoped viewer |
| Data feed | Service credential | Service credential (**same**) |

---

## Locked decisions

| Area | Decision |
|---|---|
| Trust | **Out of scope.** Proximate/Saxansaxo use endorsement/reputation trust. Never route them through the Kuja Trust engine. |
| Who runs Build | **The network operator (Adeso) runs Kuja Build** as its own ERP; the real financials live there. The donor is an **external, scoped viewer**. |
| Grant ↔ Build link | **Explicit per-grant `build_ref`** (analytic account / project id) set by an operator — there is no shared identity to auto-derive it. |
| Connection | **Server-to-server service credential** from the grant backend to Build's finance API. No human / SSO in the data path. |
| Human auth | **Unchanged** — each tenant keeps its existing login. Build is never in the human auth path. |
| Isolation | **Per grant.** A donor resolves to exactly one analytic account — the one funding this tenant's grant. |
| Fallback | **`financial_source = erp \| manual`.** No Build feed ⇒ the donor sees uploaded reports; compliance works identically. |
| Entitlement | Real-time feed is gated by the donor-org **`has_kuja_build`** flag (already in the grant app) + per-grant `financial_source='erp'`. |

---

## The two systems

| System | Role | Stack | Owns |
|---|---|---|---|
| **Networked tenant** (Proximate / Saxansaxo) | Community-trust grant-making — rounds, disbursements, donor reporting. | Flask + Next static export (`kuja-grant`, per-network) | Grants, rounds, disbursements, compliance, donor reporting |
| **Kuja Build** | The operator's accounting / finance ERP holding the **real booked financials**. | Odoo 18 | Ledger, analytic actuals, payments, disbursements |

- Tenants: `proximate.kuja.org`, `sclr.kuja.org` (Saxansaxo), resolved by host → per-`Network` isolation; audit is tenant-stamped (`g.audit_network_id`).
- Kuja Build = the operator's Odoo 18 ERP; financials keyed by **analytic account / project**.

---

## Core idea

**Bind one grant to one Build account, feed it over a service credential, show it through the donor scope you already enforce.** Three layers, only the middle one is tenant-specific:

1. **Data feed — tenant-agnostic.** A single `BuildClient` in the grant backend calls Build's finance API with a **service credential** and normalises the response to one shape (`budget_lines / actuals / disbursements`). Identical for every tenant (and the same shape the Kuja seam uses).
2. **Grant ↔ Build binding — tenant-specific.** Because there is no shared identity, an **operator sets `build_ref`** (the analytic account id) on the specific grant. That mapping is the thing that replaces Link for these tenants.
3. **Human view — unchanged.** The financials surface inside the tenant's **existing scoped donor reporting** (Proximate donor dashboards / Donor Pack PDF), behind the tenant's own auth.

---

## The connection mechanism (per-grant)

> **Shipped 2026-08-14 (Phases 0–1, inert on prod, commit `80de64321`).** The tenant-agnostic scaffold is built and deployed, dormant until a Build client is configured — prod behaviour is unchanged. Live now: `Grant.financial_source` (`erp` | `manual`, default `manual`) + `build_ref` + `financial_synced_at`; `app/services/build_client.py` (env `KUJA_BUILD_BASE_URL` / `KUJA_BUILD_SERVICE_TOKEN`; `.configured`, `get_financials(build_ref)` keyed **only** by the ref, `normalize()`); `app/services/build_engine.py` (the `erp` | `manual` selector); and the endpoints `POST /api/grants/<id>/financial-source` (operator, admin-gated + audited), `GET /api/grants/<id>/financials` (donor-scoped), `GET /api/admin/build/status`. The **only** thing left is the concrete finance-API call inside `build_client.py` — which needs the contract + **sample payload example** below.

1. **Operator maps the grant.** On the donor grant in the tenant, an operator sets `financial_source = 'erp'` and `build_ref = <analytic account id>` (one action, audited).
2. **Backend pulls on demand.** When the donor opens their grant's financials, the grant backend calls `BuildClient.get_financials(build_ref)` with the service credential — **keyed off the grant's stored `build_ref`, resolved server-side**, never a value from the request.
3. **Normalise + cache.** Build's response is normalised to the shared shape and cached with `last_synced_at`; the donor sees booked actuals against budget.
4. **Fallback is seamless.** If `financial_source = 'manual'` (or Build is unreachable), the same surface renders uploaded reports — compliance and reporting are identical either way.

**Grant-side financial contract (per grant):**
```
financial_source   # "erp" | "manual"
build_ref          # Build analytic account / project id (when erp)
# normalised rows the donor view reads, from either source:
budget_lines[]     # category, planned, currency
actuals[]          # category, spent, date, source
disbursements[]    # amount, date, payee_ref
last_synced_at
```

---

## Multi-tenant isolation — the crux

Adeso's Build holds **many** grants from the same donor. The donor (e.g. QCF) must see **only** the analytic account funding this tenant's grant. Isolation is a composition of three controls — we want all three:

1. **Single-ref binding.** The grant stores exactly **one** `build_ref`. The feed only ever queries that account, resolved **server-side from the validated grant** (isolation by record, not by any request-supplied id). No enumeration, ever.
2. **Donor scope.** The donor account is already scoped to specific rounds/grants in the tenant (the all-rounds fallback was removed). The Build financials **inherit that scope** — the donor can't reach a grant their account isn't subscribed to, so they can't reach its `build_ref`.
3. **Source-side scoping (strongest, and the key ask).** Build exposes **just the one analytic account** to the service credential — via record rules on the service account, or a **per-grant `grant.dashboard.share` token**. Then the operator's other QCF grants are unreachable *at the source*, not merely filtered by the grant app.

> **Load-bearing risk.** If the Build service credential has broad read access to all of Adeso's finance data, isolation rests entirely on control 1 (the grant-app side). Control 3 (source-side scoping) is what makes "QCF only sees the Proximate grant" a **structural** guarantee rather than a filter that could be forgotten. This is the single most important thing to get right with the dev team.

---

## Security model (cross-cutting)

- **Service credential only.** Systems talk system-to-system with a scoped credential; no human/SSO in the data path; the credential value is never exposed to the browser or the donor.
- **Isolation by record, not by URL.** The feed is keyed off the grant's stored `build_ref`, resolved server-side from a grant the viewer is already authorised to see. A request never supplies an analytic-account id.
- **Least privilege at the source.** Prefer a Build service account scoped per analytic account (or per-grant share token) so the blast radius is one account.
- **One audit spine.** Every `build_ref` mapping, every feed pull, and every donor view appends to the tenant's hash-chained, network-stamped audit log.
- **Least data.** An explicit per-audience serializer decides what leaves the tenant; store no raw Build credentials in tenant records; financial share links (if used) carry a TTL.

---

## Reference use case — QCF → Proximate (the end-to-end test)

A real, self-contained proof on **actual Adeso prod financial data** (already loaded in the Build test env):

- **Setup:** Proximate is funded by **QCF**, an Adeso donor. Adeso holds **several** grants from QCF. The **specific grant that funds Proximate** was uploaded to the Proximate tenant; QCF has a donor account there, scoped to its round(s).
- **Map:** an operator sets `build_ref` on that Proximate grant to the QCF-grant's analytic account in Build.
- **Feed:** the tenant pulls booked actuals for that account and shows them in QCF's donor reporting.
- **Positive test:** QCF sees the real financials for **its Proximate grant** — budget vs booked actuals, disbursements.
- **Negative test (the point):** QCF **cannot** see Adeso's **other** QCF grants — no mapping, no donor scope, and (ideally) no source-side access.
- **Saxansaxo:** identical shape — proving one proves the pattern.

---

## Benefits of the approach

- **One feed, every tenant.** The same `BuildClient` + `financial_source` abstraction serves Kuja, Proximate, and Saxansaxo — no per-tenant financial code to maintain or drift.
- **Decoupled from identity.** Because it never touches Link/Odoo SSO, it works for tenants that authenticate their own way. Financial integration doesn't wait on identity integration.
- **Isolation by construction.** Per-grant `build_ref` makes "the donor sees only their grant" a structural property, not a filter someone has to remember to apply.
- **Compliance with or without the ERP.** `erp | manual` means a grant without a Build link still reports via uploads on the same surface — no hard dependency on the ERP.
- **Real numbers, less reconciliation.** Donors see actuals booked in the operator's accounting system, not re-keyed figures — higher trust, fewer disputes.
- **Reuses what's already hardened.** Rides the tenant's existing donor scoping and hash-chained audit — no new access-control surface to get wrong.
- **Incremental & reversible.** Flag-gated, inert rollout (like the Trust and licensing seams): ship dormant, map one grant, prove with QCF, expand — nothing breaks meanwhile.

---

## Phased roadmap (relative effort S/M/L)

| Phase | Scope | Size |
|---|---|---|
| 0 | Financial-source abstraction — `financial_source` + `build_ref` on the tenant grant; operator "map to Build account" action; audit | ✅ shipped |
| 1 | `BuildClient` (service-credential finance client) + normaliser to the shared shape; inert until creds are set | ✅ shipped |
| 2 | Surface booked actuals in the tenant's donor reporting (Proximate dashboards / Donor Pack PDF); `manual` fallback stays source-equivalent | M |
| 3 | Isolation hardening — source-side scoping (per-account service creds or `grant.dashboard.share` token); positive **and** negative (QCF-can't-see-other-grants) tests | M |
| 4 | Freshness — pull-on-view → scheduled sync / webhook-on-posting, per the dev team's answer; Saxansaxo parity | M |

Phases 0–1 are **built & deployed** (inert on prod, commit `80de64321`) — the remaining Build-side work waits on the dev-team items below (same inert-rollout pattern as the Trust and licensing seams). What's left to run the QCF test: fill the one finance-API call in `build_client.py`, set the `KUJA_BUILD_*` env, and map the grant.

---

## What we need from the dev team to complete the integration

**A. Build finance API access (test env first)**
1. Base URL of the Build test environment + which API to use: **Odoo external API (XML-RPC / JSON-RPC)** or a **custom REST** endpoint.
2. A dedicated, **read-only service account** + credentials for the grant backend (not a human login).
3. Rate limits / SLA on the finance API, and whether the prod Build will expose the **same** API shape.

**B. The mapping keys (for the QCF → Proximate test)**
4. The **analytic account / project id** in Build for the specific QCF grant that funds Proximate (the `build_ref` to map).
5. A **second, unrelated** QCF analytic-account id, so we can write the **negative isolation test** (prove QCF can't see it).
6. Confirmation of the grant model in Build: is there a `grant.grant` object, or only analytic accounts/projects? Is it **one analytic account = one donor grant**, or many:1?

**C. The data contract (one sample per object)**
7. A **sample payload** for that account covering: **budget lines**, **booked actuals** (journal items / analytic lines), and **disbursements/payments** — with field names and types.
8. **Semantics:** amount **sign conventions** (debit/credit), **currency** (grant currency vs company currency — QAR/USD) and where FX conversion should happen, date fields, and how categories/cost-lines are identified.
9. How Adeso's **Build-booked disbursements** relate to the tenant's **own recorded disbursements** (the app records partner payments): same events to **reconcile**, or **complementary**?

### Example of the sample payload we need (item 7)

One real (redacted is fine) **response** from the Build finance API for a **single** analytic account — that's all we need to lock the contract. The names and structure can be whatever Build already returns; this only shows the *kind* of thing we're after:

```json
{
  "analytic_account_id": "4471",
  "name": "QCF – Proximate Fund 2026",
  "currency": "USD",
  "as_of": "2026-07-31",
  "budget_lines": [
    { "category": "Grants to partners",        "planned": 500000 },
    { "category": "Monitoring & verification", "planned":  40000 }
  ],
  "actuals": [
    { "category": "Grants to partners",        "spent": 312000, "date": "2026-07-31" },
    { "category": "Monitoring & verification", "spent":  18500, "date": "2026-07-31" }
  ],
  "disbursements": [
    { "amount": 25000, "date": "2026-06-15", "reference": "PMT-0091" }
  ]
}
```

We map their fields → our normalised shape (`budget_lines / actuals / disbursements`). One sample answers, in a single shot:

| What we need to know | Where the example shows it |
|---|---|
| The **account key** we query | `analytic_account_id` (= our `build_ref`) |
| **Budget** per line | `budget_lines[].category` + `planned` |
| **Booked spend** per line | `actuals[].category` + `spent` + `date` |
| **Payments / disbursements** | `disbursements[].amount` + `date` + `reference` |
| **Currency** (+ where FX happens) | `currency` — grant vs company (QAR/USD)? |
| **Sign convention** | are `spent`/`amount` positive, or credits/negatives? |
| **Freshness** | is there an `as_of` / `last_posted` timestamp? |

If Build's real object names differ (e.g. `journal_items` instead of `actuals`, `amount_signed`, `partner_id` for the payee), **just send it as-is** — we adapt `normalize()` to match. One representative example per object beats a written schema.

**D. Isolation at the source (the security ask)**
10. Can the service account be **scoped per analytic account** (Odoo record rules), so it can only read the mapped account? If not —
11. Can Build issue a **per-grant `grant.dashboard.share`-style token** (public id + secret, hash-only) scoped to one analytic account, that the grant backend calls instead of a broad credential?

**E. Freshness & operations**
12. Feed model: **pull-on-view**, **scheduled sync**, or **webhook-on-posting**? What latency do donors expect? If webhook: the **event catalogue**, payload, and signing/verification scheme.
13. Confirmation the **Build test env contains the real Adeso financial data** for this grant (you indicated it does), and the entitlement model — is the ERP/real-time feed gated **per donor** or **per grant**, and who provisions it?

---

*Related: [[KUJA_PLATFORM_INTEGRATION.md]] (Kuja-tenant, four-product). Trust is intentionally excluded here — Proximate/Saxansaxo use community-based trust. The grant app already carries the `has_kuja_build` donor entitlement and the `financial_source` concept from the Kuja seam; this spec reuses both.*
