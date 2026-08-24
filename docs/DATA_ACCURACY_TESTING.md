# Data-accuracy testing standard

> A page can render perfectly and be **wrong**. Most of the bugs the team keeps
> finding — a disbursement recorded against a round that was never activated
> (R-01), a blank Partners tab, phantom audit entries, closeout reporting "done"
> on an empty round, a UI that says "Submitted" while the record is "scored" —
> are **data/state** bugs. They sail past tests that only check that a page
> rendered or an endpoint returned `200`.

## The gap we're closing

`browser_test.py` has ~140 Playwright tests. **None of them reconcile a number
or check a computed value.** Every assertion is presence/render:

```
assert email_input.count() > 0            # a field exists
assert "grant" in body.lower()            # a word appears
assert len(ctx["csp_errors"]) == 0        # no console errors
assert publish_btn.count() > 0            # a button exists
```

Those are worth having — but they verify *the page loaded*, not *the data is
correct*. "It rendered", "200", "the control exists", "the word appears" is
**not verification**.

## What a data-accuracy test asserts

Drive the real UI as the real role, then check the **data** — with the API (same
logged-in session) as the source of truth:

| Check | Example |
|---|---|
| **Computed value == its formula** | `final_score == round(0.4·ai + 0.6·human, 2)`; a reviewer's weighted total == recompute from the criterion scores |
| **Count/total reconciles** | every application row on `/applications` maps to a real id (no phantoms); a dashboard "N awarded" == the API-derived count |
| **State shown == authoritative** | the detail page status label == the API status; after an action the *other* role's view reflects it |
| **Negative control — guard fires** | the thing that must be blocked *is* blocked from the UI (a disbursement before activation is refused) |
| **Negative control — data absent** | another tenant's orgs never appear (the SMK-015 leak class) |

Two rules that keep these honest:

1. **Never report "verified" without a data assertion.** A render or a 200 is a
   proxy, not the thing.
2. **Prove the check has teeth before trusting a green** — deploy the mutant.
   Assert a *known-wrong* value and confirm it goes red. A test that can't fail
   isn't testing. (See `checks_that_report_unearned_passes` in the project
   memory.)

## The harness

`browser_data_accuracy_test.py` (Playwright). It reuses `browser_test.py`'s
`login_as` / `get_page_text`, and uses `page.context.request` — which shares the
browser's login cookies — so the API is the source of truth *inside the same
test*. Preconditions that need rich data raise `Skip` (not fail), so the suite
only goes red on **wrong** data, never on absent data.

```bash
py -3 browser_data_accuracy_test.py --base https://fund.kuja.org   # prod
py -3 browser_data_accuracy_test.py --local                        # in-process Flask + SQLite
```

Runs in CI:
- **`.github/workflows/data-accuracy-monitor.yml`** — daily (and on demand)
  against **prod**, read-only, with the shared demo accounts. This is where the
  data is rich enough for every check to really run.
- **`.github/workflows/browser-smoke.yml`** — `--local` on every relevant push
  (mostly `Skip`s on the sparse seed, but the machinery runs and any real
  violation still fails).

## Adding a test

When you fix or build a feature, add one data-accuracy test for its invariant —
reconcile the value it produces, or prove the guard it enforces — and confirm it
fails on the pre-fix behaviour before you trust it. One test per escaped-bug
class is how the suite earns its keep.
