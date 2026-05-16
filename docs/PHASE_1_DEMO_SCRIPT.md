# Phase 1 Demo Script

10-minute walkthrough hitting every new surface.

---

## Prereqs

- App is deployed: https://web-production-6f8a.up.railway.app
- Test accounts (password: `pass123`):
  - NGO: `fatima@amani.org` (Amani Health Initiative — Kenya)
  - Donor: `sarah@globalhealth.org` (Global Health Fund)
  - Admin: `admin@kuja.org`

---

## 1. Trust Profile — donor view (~3 min)

1. Sign in as `sarah@globalhealth.org`.
2. Click **Trust Profile** in the sidebar.
3. URL becomes `/trust?org=14` (Sarah's own donor org).
4. Switch to view an NGO: open `/trust?org=2` directly in the URL bar (Salam Relief Foundation, Somalia).
5. See:
   - **Composite score** with status-tinted left border on the headline card
   - **Capacity pillar** — 5 frameworks; click to expand and see weights, scores, strengths, gaps
   - **Due diligence pillar** — 6 components; each with status pip + last-updated + drilldown
6. The whole synthesis is one screen. No more "open 5 PDFs to make a decision."

## 2. Adverse Media Screening (~2 min)

1. Still on `/trust?org=2`, scroll down to **Adverse Media Screening**.
2. Click **Run screening**.
3. Watch the AI run — first attempt uses Anthropic's hosted web_search
   tool. If unavailable, falls back to training-knowledge (clearly badged).
4. Results render with:
   - Per-finding severity (high/medium/low)
   - Category, headline, summary
   - **Real article URL** as citation (when web_search succeeds)
   - Per-finding confidence
   - Source badge (live web vs training-knowledge)
5. The AI's narrative summary appears in the "AI summary" callout above the findings.

## 3. Bank Account Verification (~2 min)

1. Sign in as NGO `fatima@amani.org`.
2. Sidebar → **Trust Profile**.
3. Scroll to **Bank Account Verification**.
4. Click **Verify bank details**.
5. Try a TYPO-ed IBAN — e.g. `KE00ABCD1234567890123456`.
6. Hit **Verify** — see `iban_checksum_failed` finding (high severity).
7. Try a real IBAN format that's structurally valid — see only structural pass + jurisdiction notes.
8. Privacy: the form accepts the full account number but only last 4 + SHA256 hash are persisted.

## 4. Capacity Passport — the moat (~2 min)

1. Still as NGO `fatima@amani.org`, on `/trust`.
2. Click **Publish Capacity Passport** at the top of the Trust Profile card.
3. New row appears in the Capacity Passport panel — status **Active**, with snapshot hash + URL.
4. Click **Copy URL**.
5. Open an incognito window (or sign out).
6. Paste the URL — `/trust/verify?s=...&t=...`.
7. Public verification page renders without any Kuja login:
   - Green "Passport Verified" banner with timestamp
   - Org name, publish date, snapshot hash (full)
   - Verification counter (incremented by your visit)
   - Full Trust Profile snapshot (frozen at publish time)
   - Footer explaining the hash, the audit trail, what to use it for.
8. Click **Copy URL** again from the NGO view — verification counter goes up by 1 each time a donor verifies.
9. Click **Revoke** — confirmation modal — type reason — done. The same URL now shows "Passport revoked" instead of the snapshot.

## 5. Tamper-evident audit (~1 min)

Behind the scenes, every passport publish / verify / revoke is appended
to the existing `audit_chain` table (PMO pattern). The hash chain
proves no row was edited after the fact. To check:

```bash
# In a Flask shell on prod (or locally)
from app.models import AuditChainEntry
result = AuditChainEntry.verify()
print(result)
# → {'ok': True, 'total': N, 'breaks': []}
```

---

## What this proves

- **Honesty:** every adverse-media / PEP / bank verification / capacity
  passport claim in the BRD is now backed by real code.
- **Differentiation:** Capacity Passport — verified-once-accepted-by-many
  — is a category-defining move no incumbent ships.
- **Trust infrastructure:** hash-chained audit + tamper-evident snapshot
  + provenance citations makes Kuja a defensible choice for donor
  governance.

---

## Known limits (be honest with the prospect)

- **Adverse media's training-knowledge fallback** is clearly labelled —
  results aren't from a live news crawl. Use the web_search layer for
  donor-grade evidence.
- **No reference-verification** (calling/emailing references). Phase 2.
- **No bank API integration** — structural validation only. Most NGO
  partner banks in the Global South don't expose verification APIs;
  donor-grade pattern is mechanical + human attestation, which is what
  Kuja does.
- **Beneficial ownership capture form** is Phase 2 — Kuja reads
  uploaded ownership docs today.
