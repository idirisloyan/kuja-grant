#!/usr/bin/env python3
"""
prune_test_artifacts.py — remove automated-test grants + their apps from a DB.

The E2E suite creates grants via the real REST API (e.g. "[E2E-TEST] …",
"Apply Entry Test Grant", "Draft Grant", timestamp-suffixed titles) and leaves
them behind. Over time they pile up on the donor dashboard and every draft an
NGO started against them shows on the NGO's own dashboard — the 14-Aug pilot
review found ~313 synthetic grants + 20 duplicate drafts drowning the real work.

This is the delete side of app/routes/admin_health.py:/test-data/inventory. It
removes every grant whose title matches the canonical automated-test matcher
(app/utils/test_artifact_titles.is_test_artifact_title — the [E2E-TEST] prefix,
the legacy exact set, and the timestamp/pattern regexes) plus, in dependency
order, its reports, applications, reviews and documents.

Safety:
  - ONLY grants matching is_test_artifact_title() are touched. Descriptive
    donor-named grants (seed + real) never match.
  - An 'awarded' grant is NEVER deleted, even if its title matched — awarded
    means real money moved; it is reported and skipped.
  - Each grant is deleted in its own transaction, so one FK snag isolates to
    that grant instead of aborting the sweep.
  - Dry-run by default; pass --confirm to apply. Audit-logged (one summary row).

Usage (inside the Railway container):
    python prune_test_artifacts.py            # dry-run — lists what would go
    python prune_test_artifacts.py --confirm  # apply
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.extensions import db
from app.models import Grant, Application, Report
from app.models.audit_chain import AuditChainEntry
from app.utils.test_artifact_titles import is_test_artifact_title


def main():
    confirm = '--confirm' in sys.argv
    app = create_app()
    with app.app_context():
        # Scan all grants; match by the canonical test-title rule. Keep this in
        # Python (not SQL) so the regex patterns are applied exactly as the
        # rest of the app understands them.
        all_grants = Grant.query.all()
        targets, protected_awarded = [], []
        for g in all_grants:
            if not is_test_artifact_title(g.title):
                continue
            if (g.status or '') == 'awarded':
                protected_awarded.append(g)
            else:
                targets.append(g)

        target_ids = [g.id for g in targets]
        app_count = (
            Application.query.filter(Application.grant_id.in_(target_ids)).count()
            if target_ids else 0
        )
        report_count = (
            Report.query.filter(Report.grant_id.in_(target_ids)).count()
            if target_ids else 0
        )

        print('=' * 70)
        print(('APPLY' if confirm else 'DRY-RUN') +
              f' — {len(targets)} test grant(s), {app_count} application(s), '
              f'{report_count} report(s) would be removed')
        print(f'total grants in DB: {len(all_grants)}   '
              f'awarded-but-test-titled (PROTECTED, skipped): {len(protected_awarded)}')
        print('-' * 70)
        # Status histogram so it's obvious we're not deleting live grants.
        from collections import Counter
        by_status = Counter((g.status or '?') for g in targets)
        print('target grant statuses:', dict(by_status))
        # Show a sample so a human can eyeball for false positives.
        for g in targets[:12]:
            print(f'  would delete  grant#{g.id:<6} status={(g.status or "?"):8} {(g.title or "")[:52]}')
        if len(targets) > 12:
            print(f'  … and {len(targets) - 12} more')
        if protected_awarded:
            for g in protected_awarded[:10]:
                print(f'  KEEP (awarded) grant#{g.id:<6} {(g.title or "")[:52]}')
        print('-' * 70)

        if not confirm:
            print('Dry-run only. Re-run with --confirm to apply.')
            return

        deleted_g = deleted_a = deleted_r = skipped = 0
        for i, g in enumerate(targets, 1):
            gid = g.id
            try:
                for rep in Report.query.filter(Report.grant_id == gid).all():
                    db.session.delete(rep); deleted_r += 1
                for a in Application.query.filter(Application.grant_id == gid).all():
                    db.session.delete(a); deleted_a += 1   # cascades reviews+docs
                db.session.delete(g); deleted_g += 1
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                skipped += 1
                print(f'  SKIP grant#{gid} ({(g.title or "")[:32]}): {e}')
            if i % 50 == 0:
                print(f'  … {i}/{len(targets)} processed')

        try:
            AuditChainEntry.append(
                action='admin.test_data.pruned',
                actor_email='prune_test_artifacts.py',
                subject_kind='system', subject_id=0,
                details={'grants_deleted': deleted_g, 'applications_deleted': deleted_a,
                         'reports_deleted': deleted_r, 'skipped': skipped,
                         'reason': 'pilot cleanup: remove automated-test grants + drafts'},
            )
        except Exception as e:
            print(f'(audit entry skipped: {e})')

        print('-' * 70)
        print(f'DONE — grants deleted={deleted_g}  applications={deleted_a}  '
              f'reports={deleted_r}  skipped={skipped}')


if __name__ == '__main__':
    main()
