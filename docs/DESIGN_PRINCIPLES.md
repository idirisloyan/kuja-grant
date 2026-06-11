# Kuja — Design Principles

> **The next leap for Kuja is not more capability. It is clarity.**
> The product already does a lot. Now it should feel like it does only
> what matters.
>
> Captured 2026-06-11 from the team's design brief. This is the
> single source of truth that every page redesign checks against.

---

## The one thing Kuja optimises for

> **Help the user do the next important thing with confidence.**

Everything else is in service of that. If a screen does not make the
next important action obvious in 5–10 seconds, it has failed — even if
it shows everything a power user could ever need.

The design should feel:

- simpler
- calmer
- more guided
- less "system exposing itself"
- more "workflow helping me move"

---

## Eight principles

### 1. Lead with action, not structure
Users should see:

- what needs attention
- what to do next
- what is blocked

…not a taxonomy of modules.

### 2. Show less by default
Most pages should have:

- one main action
- one main status
- one clear next step

Everything else should be expandable.

### 3. Make each flavor feel purpose-built
- **Kuja Network** = marketplace + applications + reporting
- **NEAR Network** = membership + governance + declarations + windows

They share infrastructure. They should not share IA.

### 4. One screen, one job
Every major page should answer:

- what is this?
- what stage is it in?
- what do I do now?

### 5. Use human workflow language
Prefer:

- "Waiting for 2 signatures"
- "Ready to release"
- "Member under review"

…over internal state labels like `in_review`, `signed_active`,
`pending_approval`.

### 6. Hide system complexity
AI, audit, metadata, diagnostics, and technical detail should
**support** the work, not dominate the page. They belong in
collapsible / drill-in surfaces, not in the main work area.

### 7. Design for low-bandwidth attention
These users are busy. Many are not product experts. Pages should be
scannable in 5–10 seconds.

### 8. Standard page anatomy everywhere

Every major page follows this shape:

```
┌────────────────────────────────────────────┐
│  Header                                    │
│  • title                                   │
│  • current status                          │
│  • one primary action                      │
│  • (one secondary action max)              │
├────────────────────────────────────────────┤
│  Attention strip                           │
│  • blockers                                │
│  • overdue items                           │
│  • next required action                    │
├────────────────────────────────────────────┤
│  Main work area                            │
│  • list / form / stepper / review panel    │
│  • timeline                                │
├────────────────────────────────────────────┤
│  Supporting detail (collapsible by default)│
│  • AI help                                 │
│  • audit                                   │
│  • attachments                             │
│  • metadata                                │
│  • history                                 │
└────────────────────────────────────────────┘
```

A `<PageShell>` primitive enforces this in code so individual pages
can't drift.

---

## Information architecture

Two **clearly different** navigation systems. Same codebase, different
shape per tenant flavor — selected by `network.slug === 'kuja'` vs
`network.slug !== 'kuja'`.

### Kuja Network

#### Donor — focused on grantmaking

| Section | Items |
|---------|-------|
| Primary | Dashboard · Grants · Applications · Reports · Organizations · Insights |
| Secondary | Messages · Search · Settings |
| **Out of primary** | governance, admin surfaces, low-frequency technical utilities |

#### NGO — focused on opportunity + execution

| Section | Items |
|---------|-------|
| Primary | Dashboard · Opportunities · Applications · Reports · Organization Profile |
| Secondary | Messages · Help / Chat · Settings |
| **Out of primary** | donor / infrastructure concepts, back-office admin |

### NEAR Network

#### Operator / Secretariat / OB — fund operations console

| Section | Items |
|---------|-------|
| Primary | Dashboard · Members · Declarations · Funds & Windows · Crisis Monitoring · Reports · Governance |
| Secondary | Messages · Feedback · Audit · Settings |

What each section *means*:

- **Members** = onboarding, review, trust, OB seat management
- **Declarations** = declare, sign, release, track
- **Funds & Windows** = structure and allocation
- **Crisis Monitoring** = inputs / evidence
- **Reports** = operational + donor reporting
- **Governance** = committee, approvals, audit, policy controls

#### Member NGO — simpler than operator mode

| Section | Items |
|---------|-------|
| Primary | Dashboard · Membership · Applications · Reports |
| Secondary | Messages · Feedback · Settings |

The most important rule for member NGOs: they should not feel like
they are inside a giant system. They should feel like:

- "my status"
- "my applications"
- "my reports"
- "my messages"

---

## Page-by-page direction

### Dashboards

#### Kuja donor
- Top: **What needs your attention today**
- Middle: Applications awaiting action · Reports awaiting review · Deadlines coming
- Lower: Portfolio insights

**Cut:** too many small metric cards, secondary charts above actionable items.

#### Kuja NGO
- Top: **Continue where you left off**
- Sections: applications in progress · reports due soon · best-fit opportunities · org readiness / profile gaps

Should feel like a workbench, not a dashboard.

#### NEAR operator
- Top action strip: memberships needing review · declarations awaiting action · grants ready to release · trust / recheck issues
- Middle: Fund → Window operational tree · current crisis activity
- Lower: reporting / governance health

Should feel operational and decisive.

#### NEAR member
- membership status
- current opportunities / applications
- due reports
- new messages / feedback

Minimal.

### Membership review
A guided decision surface, not a dense admin record.

- Top: member name · status · country / org / sector · Approve / Request info / Reject
- Middle tabs: Overview · Capacity · Due diligence · Messages · Audit
- Default view: summary + readiness flags + missing items + recommended next action
- Hide: raw details unless expanded

### Declarations
(Phase 45 already moved this in the right direction — wizard, stepper, identity-resolved committee, simplified header.)

List page needs:

- clear **New declaration**
- status chips
- "needs attention" rows
- filters: draft · awaiting signatures · ready to release · active · closed

Detail page sections (in order):

1. Header (title · window · status · primary action)
2. Stepper
3. Context
4. Committee
5. Grants / release state
6. Evidence
7. Audit

The committee should feel like **people and accountability**, not rows
in a table. "Release applications now" stays highly visible when
relevant. Supporting docs stay collapsed when empty.

### Funds & Windows
**Don't lead with configuration. Lead with operational state.**

- First the fund
- Then windows as clear cards / rows
- Inside each window: available budget · active declarations · open grants · due reports · top risks

### Crisis Monitoring
A decision-support page.

- Top: latest published report · flagged countries / events · items needing escalation
- Tabs: Current report · Signals · History
- Default: show summary + top flagged items; hide long narrative behind expanders

### Applications
- **Kuja flavor:** centered on quality · progress · reviewer clarity
- **NEAR flavor:** centered on eligibility · budget · rubric · committee decision readiness
- **Both:** summary first, budget second, AI assist in a side panel or collapsible block, audit / history below.

### Reports
Calmer.

- Top: due date · status · score / readiness · next action
- Then: report sections · attachments · follow-ups · history
- **NEAR:** add window / declaration context clearly but lightly.

### Messages and feedback
Simple, not over-designed.

- **Messages:** inbox left · thread center · metadata right only if needed
- **Feedback:** filters at top · list · quick response inline

---

## What we remove or reduce across the whole app

- Too many cards
- Empty cards
- Repeated counters
- Overlapping status signals
- AI buttons in too many places
- Metadata above the main action
- Long unstructured detail sections
- Internal workflow jargon

---

## Highest-priority simplification moves

If we only do a few things, do these first (in order):

1. Separate navigation by flavor and role *(Phase 46)*
2. Rebuild dashboards around "What needs attention now" *(Phase 48)*
3. Standardize page anatomy everywhere *(Phase 47 — `<PageShell>` primitive)*
4. Collapse secondary detail aggressively
5. Simplify declarations, membership review, and funds / windows
6. Reduce card sprawl
7. Rewrite status copy into human action language *(Phase 50)*

---

## Bottom line

The product already does a lot. Now it should feel like it does only
what matters.

- **Kuja Network** should feel like a simple, intelligent funding
  marketplace.
- **NEAR Network** should feel like a simple, disciplined network-fund
  operating system.
