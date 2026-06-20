# UAT Fixtures — what is "expected demo state" in production

This doc is the source of truth for **what the production database
should contain after a clean seed**. When the team is testing and
sees something that doesn't match this list, that's drift — flag
it and run the cleanup tooling at the bottom of this file.

Generated from `seed.py`; if you change the seed you must update
this doc in the same commit.

---

## Canonical seed users (password `pass123` for all accounts)

| Role | Email | Org | Country | Notes |
|---|---|---|---|---|
| admin | `admin@kuja.org` | (platform) | — | Platform-wide admin |
| NGO | `fatima@amani.org` | Amani Community Development | Kenya | Registered NGO |
| NGO | `ahmed@salamrelief.org` | Salam Relief Foundation | Somalia | Registered NGO |
| NGO | `thandi@ubuntu.org` | Ubuntu Education Trust | South Africa | Registered NGO |
| NGO | `peter@hopebridges.org` | Hope Bridges Initiative | Uganda | Registered CBO |
| NGO | `aisha@sahelwomen.org` | (Sahel Women's Network) | Nigeria | Pending registration — used to test the registration-pending UX |
| donor | `sarah@globalhealth.org` | Global Health Fund | Switzerland | Bilateral donor demo |
| donor | `david@eatrust.org` | East Africa Development Trust | Kenya | Regional donor demo |
| reviewer | `james@reviewer.org` | Independent Review Associates | Kenya | Reviewer account A |
| reviewer | `maria@reviewer.org` | Independent Review Associates | Kenya | Reviewer account B |

**Total: 10 users across 7 orgs.** Any account outside this list
is a real team member account or drift.

---

## Canonical seed grants

All five grants belong to the donor account `sarah@globalhealth.org`
(Global Health Fund) or `david@eatrust.org` (East Africa Development
Trust). Seed grants always have descriptive, donor-named titles —
short titles like `"Tiny Test"` or `"X"` are E2E artifacts (see
"Test artifacts" below).

| Title | Funding | Deadline | Status |
|---|---|---|---|
| USAID East Africa WASH Program 2026-2028 | $2.5M | 2026-06-22 | open |
| Global Fund Maternal & Newborn Health Initiative | $1.8M | 2026-05-22 | open |
| DFID Climate Resilience for Smallholder Farmers | $950K | 2026-07-15 | open |
| EU Gender-Based Violence Prevention Program | $680K | 2026-06-30 | open |
| World Bank Youth Employment & Digital Skills | $1.2M | 2025-10-31 | closed |

---

## Canonical seed applications (status distribution)

The seed creates **9 applications** across the five grants. They cover
every status the dashboards branch on so each role's "needs attention"
panel has at least one example to land on.

| Status | Approximate count | Why it's in the seed |
|---|---|---|
| `submitted` | 5 | Submitted recently; main donor + reviewer queue |
| `draft` | 1 | Demonstrates the NGO "resume drafting" CTA |
| `under_review` | 1 | Powers the reviewer dashboard tile |
| `awarded` | 1 | Powers the "active grants" tile for NGO + donor |
| `rejected` | 1 | Demonstrates the "why-rejected" coaching surface |

---

## Test artifacts — what is NOT seed data

Anything matching one of the patterns below was created by an
automated test run (most likely `test_e2e_final.py`) and should be
deleted by the pruner. None of these collide with the seed naming
convention above.

**Grant titles that mean "this is a test artifact":**

- Any grant whose title starts with `[E2E-TEST]` (the going-forward
  marker, applied automatically by the test runner via the `E()`
  helper)
- Any grant whose title is exactly one of the legacy markers listed
  in `app/utils/test_artifact_titles.LEGACY_TEST_GRANT_TITLES` —
  for example `"Apply Entry Test Grant"`, `"Tiny Test"`,
  `"Wizard E2E Grant"`, `"Regression Grant"`, `"X"`. These were the
  bare titles the suite used before the prefix convention landed.

**Stale draft applications:**

- Draft applications older than 30 days whose grant is NOT in the
  canonical seed are reported by the inventory endpoint as
  `stale_drafts`. They're not auto-pruned by default — operators
  must explicitly pass `--stale-drafts-older-than-days N` to the
  pruner to sweep them.

---

## Tooling

### Read-only inventory (admin only)

```http
GET /api/admin/test-data/inventory
GET /api/admin/test-data/inventory?stale_draft_age_days=14
```

Returns the current count of test grants, their applications, and
stale drafts. No state changes.

### Pruner (CLI, run from Railway)

```sh
# Show what would be deleted (default behaviour)
railway run python scripts/prune_test_artifacts.py --dry-run

# Actually delete
railway run python scripts/prune_test_artifacts.py --confirm

# Also sweep stale drafts on non-test grants (optional)
railway run python scripts/prune_test_artifacts.py --confirm \
    --stale-drafts-older-than-days 30
```

Safe-by-default: the script exits 0 with a printed ledger if you
omit `--confirm`. Title matching is exact, never substring.

### E2E test convention

`test_e2e_final.py` uses an `E(label)` helper that prefixes every
grant title with `[E2E-TEST]`. New tests should follow this
convention so the pruner recognises their output unambiguously.

---

## When to refresh this doc

Update this file in the same commit that:

- Adds, removes, or renames a seed user / org / grant in `seed.py`
- Changes the application status distribution in the seed
- Introduces a new class of fixture (e.g. a fund / window / network
  scenario that becomes part of the canonical demo state)
