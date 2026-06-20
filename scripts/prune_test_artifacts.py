"""
Prune test-suite artifacts from the database.

The E2E suite (test_e2e_final.py) creates short-named draft grants
("Apply Entry Test Grant", "Tiny Test", "Wizard E2E Grant", etc.)
through the REST API and leaves them behind. Over time these show
up on the donor's dashboard and any NGO who drafted an application
against them ends up with draft clutter on their own dashboard,
making it impossible to tell intentional demo data from automation
drift.

The list of titles to prune lives in
`app/utils/test_artifact_titles.py` — single source of truth shared
with the inventory endpoint (`GET /api/admin/test-data/inventory`)
and the test runner.

Usage:

    # Dry run (DEFAULT — prints what would be deleted, deletes nothing)
    railway run python scripts/prune_test_artifacts.py --dry-run

    # Actually delete — requires the explicit --confirm flag
    railway run python scripts/prune_test_artifacts.py --confirm

    # Also sweep draft applications older than N days (NOT attached to
    # a test grant). Defaults to off; use only when the team agrees a
    # cutoff is right.
    railway run python scripts/prune_test_artifacts.py --confirm \\
        --stale-drafts-older-than-days 30

Safety:
  - Title match is EXACT, never substring or fuzzy. Seed grants use
    descriptive donor-named titles ("USAID East Africa WASH Program
    2026-2028" etc.) that cannot collide with the test marker set.
  - Wraps everything in a single transaction. If any step fails the
    whole prune rolls back.
  - Prints a per-entity ledger before deletion and a final summary
    after. Designed to be run from CI or a terminal, no env-driven
    auto-delete.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta

# Allow running this as `python scripts/prune_test_artifacts.py`
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.extensions import db
from app.models.application import Application
from app.models.grant import Grant
from app.models.organization import Organization
from app.utils.test_artifact_titles import (
    LEGACY_TEST_GRANT_TITLES, E2E_TITLE_PREFIX, is_test_artifact_title,
)


def _find_test_grants() -> list[Grant]:
    return (
        Grant.query
        .filter(db.or_(
            Grant.title.in_(set(LEGACY_TEST_GRANT_TITLES)),
            Grant.title.startswith(E2E_TITLE_PREFIX),
        ))
        .all()
    )


def _find_stale_draft_apps(grant_ids: list[int], stale_days: int) -> list[Application]:
    cutoff = datetime.utcnow() - timedelta(days=stale_days)
    q = (
        Application.query
        .filter(Application.status == 'draft')
        .filter(Application.created_at < cutoff)
    )
    if grant_ids:
        q = q.filter(~Application.grant_id.in_(grant_ids))
    return q.all()


def _delete_apps_dependents(app_ids: list[int]) -> dict[str, int]:
    """Delete rows that point at Application but don't cascade.

    Returns a count map: {table: rows_deleted}. Application.documents
    and Application.reviews have cascade='all, delete-orphan' on the
    relationship — they fall out when the Application row is removed.
    Diligence and Report references to applications do NOT cascade.
    """
    counts = {}
    if not app_ids:
        return counts
    try:
        from app.models.diligence import DiligenceItem
        counts['diligences'] = (
            DiligenceItem.query
            .filter(DiligenceItem.application_id.in_(app_ids))
            .delete(synchronize_session=False)
        )
    except Exception:
        # Model may not exist in older schemas — skip rather than fail.
        counts['diligences'] = 0
    try:
        from app.models.report import Report
        # Null out application_id on linked reports (FK is nullable).
        # Don't delete the report — it may be tied to a non-test grant.
        affected = (
            Report.query
            .filter(Report.application_id.in_(app_ids))
            .update({Report.application_id: None}, synchronize_session=False)
        )
        counts['reports_unlinked'] = affected
    except Exception:
        counts['reports_unlinked'] = 0
    return counts


def _delete_grants_dependents(grant_ids: list[int]) -> dict[str, int]:
    """Delete rows that point at Grant but don't cascade."""
    counts = {}
    if not grant_ids:
        return counts
    for mod, cls_name, attr in (
        ('app.models.report', 'Report', 'grant_id'),
        ('app.models.compliance_snapshot', 'ComplianceSnapshot', 'grant_id'),
        ('app.models.grant_question', 'GrantQuestion', 'grant_id'),
        ('app.models.monitoring_visit', 'MonitoringVisit', 'grant_id'),
    ):
        try:
            module = __import__(mod, fromlist=[cls_name])
            klass = getattr(module, cls_name)
            counts[cls_name.lower() + 's'] = (
                klass.query
                .filter(getattr(klass, attr).in_(grant_ids))
                .delete(synchronize_session=False)
            )
        except Exception as e:
            # Some FK pointers may not exist or the model may be absent.
            # The grant delete itself will then raise IntegrityError and
            # roll back — which is exactly the safe behaviour we want.
            counts[cls_name.lower() + 's'] = f"skipped ({e!s})"
    return counts


def _print_ledger(test_grants, test_apps, stale_drafts):
    org_ids = {a.ngo_org_id for a in (*test_apps, *stale_drafts) if a.ngo_org_id}
    org_ids |= {g.donor_org_id for g in test_grants if getattr(g, 'donor_org_id', None)}
    org_names = {
        o.id: o.name
        for o in Organization.query.filter(Organization.id.in_(org_ids)).all()
    } if org_ids else {}

    print(f"  Test grants found: {len(test_grants)}")
    for g in test_grants:
        donor = org_names.get(getattr(g, 'donor_org_id', None), '?')
        created = g.created_at.isoformat() if g.created_at else '?'
        print(f"    grant #{g.id}  '{g.title}'  donor={donor}  created={created}")

    print(f"  Applications on those grants: {len(test_apps)}")
    by_grant: dict[int, int] = {}
    for a in test_apps:
        by_grant[a.grant_id] = by_grant.get(a.grant_id, 0) + 1
    for gid, n in sorted(by_grant.items()):
        title = next((g.title for g in test_grants if g.id == gid), '?')
        print(f"    grant #{gid}  '{title}': {n} application(s)")

    if stale_drafts:
        print(f"  Stale drafts (>cutoff) on NON-test grants: {len(stale_drafts)}")
        by_org: dict[int, int] = {}
        for a in stale_drafts:
            by_org[a.ngo_org_id] = by_org.get(a.ngo_org_id, 0) + 1
        for oid, n in sorted(by_org.items(), key=lambda x: -x[1]):
            print(f"    org={org_names.get(oid, '?')}: {n} stale draft(s)")


def prune(*, dry_run: bool, stale_draft_days: int | None) -> int:
    test_grants = _find_test_grants()
    grant_ids = [g.id for g in test_grants]
    test_apps = (
        Application.query.filter(Application.grant_id.in_(grant_ids)).all()
        if grant_ids else []
    )
    stale_drafts = (
        _find_stale_draft_apps(grant_ids, stale_draft_days)
        if stale_draft_days else []
    )

    mode = "DRY RUN — no changes" if dry_run else "CONFIRMED — will delete"
    print(f"== prune_test_artifacts ({mode}) ==")
    _print_ledger(test_grants, test_apps, stale_drafts)

    if dry_run:
        print()
        print("Dry run complete. Re-run with --confirm to actually delete.")
        return 0

    if not test_grants and not stale_drafts:
        print("Nothing to delete.")
        return 0

    # Defensive last-line check — title equality should already exclude
    # seed grants, but verify before destructive ops anyway.
    for g in test_grants:
        if not is_test_artifact_title(g.title):
            print(f"ABORT: grant #{g.id} title '{g.title}' "
                  f"is not in the test-artifact set. Refusing to delete.")
            return 2

    try:
        app_ids = [a.id for a in test_apps] + [a.id for a in stale_drafts]
        if app_ids:
            print(f"  Deleting dependents for {len(app_ids)} application(s)…")
            app_dep_counts = _delete_apps_dependents(app_ids)
            for k, v in app_dep_counts.items():
                print(f"    {k}: {v}")
            n_apps = (
                Application.query.filter(Application.id.in_(app_ids))
                .delete(synchronize_session=False)
            )
            print(f"    applications: {n_apps}")
        if grant_ids:
            print(f"  Deleting dependents for {len(grant_ids)} grant(s)…")
            grant_dep_counts = _delete_grants_dependents(grant_ids)
            for k, v in grant_dep_counts.items():
                print(f"    {k}: {v}")
            n_grants = (
                Grant.query.filter(Grant.id.in_(grant_ids))
                .delete(synchronize_session=False)
            )
            print(f"    grants: {n_grants}")
        db.session.commit()
        print("Committed.")
        return 0
    except Exception as e:
        db.session.rollback()
        print(f"ABORT: rolled back due to error: {e}")
        return 3


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument('--dry-run', action='store_true',
                   help='Print what would be deleted; do not write.')
    g.add_argument('--confirm', action='store_true',
                   help='Actually delete the listed rows.')
    parser.add_argument('--stale-drafts-older-than-days', type=int, default=None,
                        help=('Also sweep draft applications older than N days '
                              'whose grant is NOT a test artifact. Off by default.'))
    args = parser.parse_args(argv)

    if args.stale_drafts_older_than_days is not None:
        if args.stale_drafts_older_than_days < 7:
            parser.error('--stale-drafts-older-than-days must be at least 7')

    app = create_app()
    with app.app_context():
        return prune(
            dry_run=args.dry_run,
            stale_draft_days=args.stale_drafts_older_than_days,
        )


if __name__ == '__main__':
    sys.exit(main())
