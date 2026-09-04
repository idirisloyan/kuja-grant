# Historical funding round import — pathway (prepared, NOT run)

Requested in the 4 September 2026 QA handoff. This is the pathway for bringing
funding rounds that happened **before** Proximate ran on Kuja into the system as
**history**, without pretending they happened today and without creating work
for anyone.

Tool: [`import_historical_round.py`](../../import_historical_round.py) (repo root).
Sample package: [`sample_round_package.json`](sample_round_package.json).

## What the pathway guarantees

| Requirement in the pack | How the tool meets it |
| --- | --- |
| Preview / dry-run | Default mode. Validates, resolves duplicates, reconciles money, prints the plan. Writes nothing. |
| Provenance | Every created row is stamped `import_batch_id` + `import_source_ref` (new nullable columns on round, partner, disbursement, grant; auto-reconciled on boot). |
| Original dates | Round drafted / submitted / activated / closed, partner nominated / cleared, disbursement sent / report due / report submitted are taken from the package. `created_at` stays the import time (that is when the record came to exist). |
| No fake audit history | One audit entry per created row, action `proximate.historical.imported`, note **"Historical record imported"**, with batch, source, source ref and the original dates. Plus one `proximate.historical.batch` summary. No nomination / endorsement / signature / release events are fabricated. |
| No notifications, no current tasks | Writes go through the ORM only. No messaging, reminder, report-link, receipt or verifier token is created; no intervention is opened. Verified by test: the message table is unchanged after an import. |
| Idempotency | Re-running the same package skips every row already carrying that batch + source ref. |
| Duplicate detection | Partner name (EN or AR, case-insensitive) already in the tenant → **reused**, never twinned (`force_create: true` overrides per partner). Round title already present → error unless `round.reuse_existing_id` names it. Disbursement matching an existing (partner, sent date, amount) → skipped. |
| Relationship reconciliation | Awards and disbursements must reference partners in the package; roster rows are created per award. |
| Financial reconciliation | Warns when releases or awards exceed the envelope, when a partner's releases differ from their award, or when a partner has releases but no award. Grant allocation above the committed amount is an error. |
| Status reconstruction | Missing round status is derived from the dates; missing partner status from whether they received money; missing disbursement status from report dates; missing roster stage from releases and reports. Every reconstruction is printed as a note. |
| Rollback | `--rollback <batch>` removes exactly the rows the batch created. Refused if any later, non-import audit activity touched them. Audit entries are never deleted; the rollback is itself audited. |
| Import report | `--report out.json` writes the full plan, notes, warnings, totals and result. |
| Tenant / role boundaries | Scoped to the Proximate network; `--actor` must be an active user holding an Oversight Body seat. No hard-coded system user. |

## Package format

One JSON object per round:

```
batch_id      3–64 chars [A-Za-z0-9._-]   groups one import run (idempotency + rollback)
source        free text                    where the data came from
round         { source_ref, title, title_ar?, trigger_type?, trigger_summary?, donor_name?,
                envelope_usd?, target_country?, target_region?, target_locality?,
                status?, phase?, dates: { drafted_at (required), submitted_at?, activated_at?,
                closed_at?, cancelled_at? }, closing_summary?, reuse_existing_id? }
grant?        { source_ref, title, donor_name?, donor_grant_ref?, amount_committed_usd?,
                amount_received_usd?, currency?, start_date?, end_date?, reporting_cadence?,
                status?, signed_at?, allocated_to_round_usd? }
partners[]    { source_ref, name, name_ar?, locality?, state?, country?, contact_email?,
                status?, nominated_at?, dd_cleared_at?, trust_tier?, force_create? }
awards[]      { partner_ref, amount_usd, stage?, notes? }
disbursements[] { source_ref, partner_ref, amount_usd, sent_at (required), received_at?,
                report_due_at?, report_submitted_at?, status?, verified?, purpose? }
```

Dates are ISO (`YYYY-MM-DD` or full timestamps; naive timestamps are read as UTC).
Vocabularies are the product's own: round status `draft|in_review|active|cancelled|closed`,
partner status `nominated|endorsements_open|dd_pending|dd_clear|suspended`, disbursement
status `pending_report|reported|verified|flagged` (`pending_cosign` is rejected — a
historical release cannot be awaiting a co-signature).

## Running it

Run from a machine whose `DATABASE_URL` points at the target database. Do **not** run it
through `railway ssh` into the web worker — long `create_app` scripts there have wedged
production before.

```bash
# local throwaway database
KUJA_DB_PATH=/tmp/hist.db py seed_proximate.py
KUJA_DB_PATH=/tmp/hist.db py import_historical_round.py docs/historical_import/sample_round_package.json --actor ob@proximate.org
```

```bash
# production — export Railway's DATABASE_PUBLIC_URL for the ONE command; never commit it,
# never put it in a GitHub secret.
DATABASE_URL="$(railway variables --service Postgres --json | py -c 'import sys,json;print(json.load(sys.stdin)["DATABASE_PUBLIC_URL"])')" \
SEED_PROXIMATE_ON_BOOT=false \
py import_historical_round.py package.json --actor <ob email> --report import_report.json
```

Sequence for a real import:

1. Prepare the package from the source tracker; keep the tracker's own row ids as `source_ref`.
2. **Preview** (`--report`). Read every REUSE, DUP and reconstruction note and every warning.
3. Fix the package until the preview has zero errors and the warnings are understood.
4. `--apply --confirm-historical`, keeping the report file with the import.
5. Check the round in the product: dates, roster, releases, "Historical record imported" audit rows.
6. If anything is wrong: `--rollback <batch> --confirm-rollback` (blocked once product activity has touched the rows), fix, re-run.

## Verified locally (4 Sep 2026)

`tests/historical_import_check.py` runs the whole cycle against a throwaway SQLite
database: preview writes nothing; apply creates the rows with original dates, one
"Historical record imported" audit entry per row, no messages; a second apply is a no-op;
rollback removes exactly the batch and is refused after product activity on an imported row.

Status: **prepared only — no historical data has been imported.**
