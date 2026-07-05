# Ops setup — WhatsApp Business API + Twilio SMS

> Team-facing runbook, written 2026-07-05. These two accounts unblock
> Proximate Phases 717 (WhatsApp auto-sends + inbox) and 718 (SMS
> fallback). Engineering wiring is already scoped — the ONLY blocker
> is the credentials below landing on Railway.
>
> Railway target for every env var: project `clever-cooperation`
> (production — the one whose canvas shows web / Postgres /
> near-redirect), service **web**, then click the Apply/Deploy banner.

---

## A. WhatsApp Business API (Meta Cloud API)

**Prerequisites**
- A phone number NEVER used with personal WhatsApp (new SIM or virtual
  number that can receive an SMS/voice verification). It does not have
  to be a Sudanese number — recipients see the display name.
- Adeso business registration document (PDF/scan) for verification.

**Steps**
1. business.facebook.com → Create a business portfolio → "Adeso",
   shared Adeso email.
2. START BUSINESS VERIFICATION FIRST (24–72h review): Business
   Settings → Security Center → Start Verification → upload the
   registration document. Everything else proceeds in parallel.
3. developers.facebook.com → My Apps → Create App → type **Business**
   → link to the Adeso portfolio → app dashboard → **WhatsApp → Set
   up**.
4. WhatsApp → API Setup → Add phone number → verify via SMS/voice →
   display name "Proximate Fund (Adeso)".
5. Permanent token: Business Settings → Users → System Users → Add
   (Admin) → Assign Assets (app + WhatsApp account) → Generate token
   with `whatsapp_business_messaging` + `whatsapp_business_management`.
   Shown once — copy immediately.
6. Set on Railway (exact names):
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_BUSINESS_ACCOUNT_ID`
   - `WHATSAPP_ACCESS_TOKEN`
7. Message templates: DO NOT draft ad-hoc. Engineering supplies the 8
   pre-drafted templates (EN + AR) matching the code's template names:
   `endorsement_invite`, `endorsement_reminder`, `report_ack`,
   `report_reminder`, `disbursement_notify`, `outcome_reminder`,
   `partner_cleared`, `round_activated`. Each language reviews
   separately (~24h); any edit resets the clock.
8. Cost: ~US$0.01–0.05 per template message to Sudan; first 1,000
   service conversations/month free. Add a payment method in Business
   Settings → Payments when prompted.

**Stop after step 6** — webhook wiring (delivery receipts, inbound
inbox) is engineering work that follows Phase 717-a.

---

## B. Twilio (SMS fallback for the ~30% without WhatsApp)

1. twilio.com → sign up with a shared Adeso email → verify email +
   phone.
2. Upgrade to paid (Billing → add card). Trial accounts can only text
   pre-verified numbers — useless for partners.
3. **Enable Sudan**: Console → Messaging → Settings → Geo permissions
   → enable Sudan. (Off by default; sends silently fail without it.)
4. Buy a number: Phone Numbers → Buy a Number → US long code with SMS
   (~$1.15/mo).
5. Spending cap: Console → Monitor → Usage → Usage triggers → alert +
   suspend at $25/month (Sudan SMS ≈ $0.05–0.10/message).
6. Set on Railway (exact names):
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM_NUMBER`  (E.164, e.g. +1415…)

---

## After either lands

Tell engineering (or the Claude session) the keys are set — wiring +
live verification happens same-day. Track status in
[PROXIMATE_BACKLOG.md](PROXIMATE_BACKLOG.md) Phases 717/718.
