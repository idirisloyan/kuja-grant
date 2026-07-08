# Proximate — Capabilities & Readiness Manifest

_Single source of truth for "what is actually real" on the Proximate tenant._
_Label every claim in decks, docs, and demos against this table so nothing is over- or under-stated._

**Readiness legend**

| Tag | Meaning |
|---|---|
| **UI-ready** | Full end-to-end flow with a UI; a user can do it unaided. |
| **API-only** | Endpoint works and is tested, but there is no dedicated UI (or a minimal one). |
| **Provider-dependent** | Code path is complete but needs an external account/key to run live. |
| **Seeded-demo** | Present for demos via seeded fixtures; not a self-serve production flow. |
| **Backlog** | Deliberately deferred; not built. |

_Last updated: July 2026 (Wave 1 — Phase 717). Update this file in the same commit as any change to a capability's readiness._

---

## Endorser & partner intake

| Capability | Readiness | Notes |
|---|---|---|
| Public partner self-nomination (`/proximate-nominate`) | UI-ready | Honeypot + 24h dedup + sanctions screen. |
| OB-on-behalf nomination | **UI-ready (Wave 1)** | New form `/proximate/admin/partners/new`. Was API-only. |
| Endorser self-register + light-KYC queue | UI-ready | `/proximate/endorse/register`, `/proximate/admin/endorsers`. |
| Endorsement wizard + per-question voice | UI-ready | Whisper transcription is **provider-dependent** (WHISPER_API_KEY). |
| Zero-login endorser portal / elder invite | UI-ready | Token links shared via WhatsApp deep-link. |
| Sanctions screening on nominate | Provider-dependent | OpenSanctions API + fallback list; non-blocking. |
| Reputation algorithm | UI-ready | Deterministic (no AI). |

## Funding rounds & disbursement

| Capability | Readiness | Notes |
|---|---|---|
| Funding rounds (create → sign → activate → close) | UI-ready | `/proximate/rounds`. Round task-board added Wave 1. |
| Add partner to round | UI-ready | Add-partner dialog on round detail. |
| FSP registry (bank / hawala / mobile money) | **UI-ready (Wave 1)** | New form `/proximate/admin/fsps/new`. Was API-only. |
| Disbursement methods per partner | UI-ready | On partner detail. |
| Disbursement + cosign ladder ($10k/$50k/$200k) | UI-ready | Self-cosign blocked; ladder progress shown. |
| Plan-B FSP fallback | UI-ready | Banner only on `route_failure_security` flag. |
| Independent third-party verifier | **UI-ready (Wave 1)** | "Assign independent verifier" on disbursement detail. Was API-only. |
| Tranche scheduler | API-only | Annotation only; not auto-linked to disbursements. |

## Reporting & outcomes

| Capability | Readiness | Notes |
|---|---|---|
| Per-disbursement report via token (SoP 12) | UI-ready | `/proximate-report`; dual-auth (token or OB session). |
| Photo/voice evidence + auto-transcription | UI-ready | Transcription **provider-dependent** (Whisper). |
| Partner acknowledgement | UI-ready | Surfaces on the partner's token URL. |
| End-of-round report + server PDF | UI-ready | PDF is **provider-dependent** (reportlab; 503 without it). |
| 90-day outcome attestation | UI-ready | Spawned on verify/flag. |
| Donor money-trail / traceability | **UI-ready (Wave 1)** | `/proximate/grants/traceability?grant=<id>`. |

## Governance & oversight

| Capability | Readiness | Notes |
|---|---|---|
| OB attention queue ("what needs a human now") | **UI-ready (Wave 1)** | Top of `/proximate/admin`. |
| Interventions + SoP-13 response timers | UI-ready | Escalation via cron. |
| Security keyword auto-intervention | UI-ready | Cron-driven (EN + AR keywords). |
| Fraud/safety grievance auto-freeze (SoP 14) | UI-ready | Fixed July 2026 (`546cd89e6`) — was 500. |
| Grievance channel + OB triage | UI-ready | `/proximate-grievance`, `/proximate/admin/grievances`. |
| Public transparency page | UI-ready | `/proximate`; aggregates only. |
| Hash-chained audit chain (+ JSONL export) | UI-ready | OB-only. |

## Donor features

| Capability | Readiness | Notes |
|---|---|---|
| Donor portfolio dashboard | UI-ready | `/proximate/donor`. |
| Donor "Ask AI" | Provider-dependent | Sonnet→Haiku; **AI-dependent** (503 when unavailable). |
| Donor subscribe/unsubscribe to rounds | API-only | No UI control yet; donor sees fallback all-rounds listing. |
| Grant report draft/score lifecycle (OB) | Provider-dependent | AI-drafted; 503 without AI. |
| Compliance-per-requirement + deliverable progress | UI-ready | Auto-sourced from rounds/reports. |
| Donor Pack PDF | Provider-dependent | reportlab; media summarised as counts (R2 embed = Backlog). |
| Grant extraction wizard (inbound grant, OB) | Provider-dependent | AI extraction; OB-only, not donor-facing. |

## AI surfaces

| Capability | Readiness | Model / fallback |
|---|---|---|
| Donor Ask AI | Provider-dependent | Sonnet→Haiku; HTTP 503 when down. |
| Grant report draft / score | Provider-dependent | Sonnet; HTTP 503 when down. |
| Grant extraction | Provider-dependent | Sonnet; HTTP 503 when down. |
| Crisis decision brief | Provider-dependent | Sonnet; **deterministic fallback (HTTP 200)** when down. |
| Adverse-media screening | Provider-dependent | Sonnet + web_search; training-knowledge fallback. |
| Voice transcription | Provider-dependent | Whisper `whisper-1`; silent when no key. |

## Notifications & field reach

| Capability | Readiness | Notes |
|---|---|---|
| In-app / audit-based nudges (overdue, escalation) | UI-ready | Crons emit audit rows; surfaced in the attention queue. |
| WhatsApp share (deep-link) | UI-ready | `wa.me` links from the app. |
| **WhatsApp Business API (outbound push)** | **Provider-dependent / Backlog** | Integration point defined; **needs a provider account.** Until live, SoP-12/13 clocks are in-app/audit-only. |
| **SMS (Twilio / Africa's Talking)** | **Provider-dependent / Backlog** | Same as above — needs an account. |

## Cross-cutting

| Capability | Readiness | Notes |
|---|---|---|
| Arabic-first + RTL | UI-ready | Default for Proximate users. |
| i18n (en/fr/ar/sw/so/es) | UI-ready | New Wave-1 OB copy uses English fallbacks pending localization. |
| Offline endorsement (PWA outbox) | UI-ready | Queues and syncs. |
| Real-device / weak-connectivity field UAT | **Backlog** | Needs real devices + Arabic-first field testers. |
| Stamped prod-safe P0 UAT harness | UI-ready (tooling) | `tests/proximate_p0_uat.py` — repeatable, `--cleanup` by stamp. |
