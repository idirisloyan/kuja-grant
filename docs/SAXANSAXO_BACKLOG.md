# Saxansaxo — Tenant Backlog

> SCLR (Survivor and Community-Led Response) micro-grants in Somalia,
> Resilio-funded, ~USD 5,000 per grant. Design doc:
> [Saxansaxo_Automation_Design_July2026.docx](Saxansaxo_Automation_Design_July2026.docx).
>
> **Design posture (do not erode):** the system records the story of
> each decision — it never polices spending. No cosign ladders, no
> receipt verification, no outcome-attestation gates. Post-disbursement
> misuse is a learning loss by SCLR doctrine. The two quiet
> non-negotiables are Adeso legal duties: a sanctions screen on the
> receiving signatory (records, never gates) and a record of who was
> paid. THE metric: days from selection to money in hand (SLA 10).

Created 2026-07-20 with the v0 ship (`34a13db6d`).

---

## Shipped

### v0 tenant — full 8-step SCLR cycle (2026-07-20, `34a13db6d`)
Network `saxansaxo` (id 4, Somali-default, brand `#0E8A7B` placeholder),
temp access pre-domain via `?network=saxansaxo` on the Railway URL.
Models `app/models/saxansaxo.py` (computed group stage), 19 API routes
under `/api/saxansaxo` gated by `SaxOpsMember` only (deny-by-default,
platform admins do NOT auto-pass), tenant-stamped `saxansaxo.*` audit
actions, fund envelope ceiling, political-interference pause register,
public no-login proposal/report token pages (bilingual Somali-first).
Console: `/saxansaxo/admin` (10-day clock, envelopes, outcomes, pauses),
`/saxansaxo/groups` + detail (journey strip, per-step actions).
Gate: 18 lifecycle + deny checks in `regression.py` (116/116).

---

## Open items

### Real SCLR templates (pre-build ask #1 — still open)
- **last_touched:** 2026-07-20
- The inquiry questions, proposal questions, and vetting criteria in v0
  are PLACEHOLDERS (marked in
  `frontend/src/app/(app)/saxansaxo/groups/[groupId]/client.tsx` and
  the two public pages). Swap in the team's actual inquiry template,
  proposal template, and SCLR selection-criteria list when provided.

### Resilio agreement oversight language (pre-build ask #2 — still open)
- **last_touched:** 2026-07-20
- The no-spend-policing posture is encoded from the program doc, not
  from the donor agreement. Get the Resilio agreement's actual
  financial-oversight wording and confirm (in writing) that the
  risk-acceptance matches what v0 implements.

### Ops onboarding before pilot
- **last_touched:** 2026-07-20
- Rotate the bootstrap seed `ops@saxansaxo.org` password.
- Add real ops team seats — `SaxOpsMember` rows have no management UI
  yet (DB/console only). Small admin surface or seed script needed.

### Branding
- **last_touched:** 2026-07-20
- `#0E8A7B` is a placeholder; no logo/tenant-mark assets. Follow the
  per-tenant convention (`/tenants/<slug>/` assets + runtime link swap)
  once a brand guide exists.

### Console i18n (Somali)
- **last_touched:** 2026-07-20
- Ops console pages are plain English v0 (accepted debt — the public
  community pages are bilingual so/en by design). Localise the console
  via `sax.*` keys when the tenant goes past pilot.

### WhatsApp delivery of token links
- **last_touched:** 2026-07-20
- v0 is copy-link only. Wire the existing messaging adapter (Twilio
  sender +254705529285) so proposal/report links can be sent directly —
  matches how the team actually reaches groups.

### Domain
- **last_touched:** 2026-07-20
- `saxansaxo.kuja.org` is aliased in the Network row but not DNS'd.
  Repeat the Proximate go-live runbook (TXT verification gotchas noted
  in the Proximate memory) when the team is ready.
