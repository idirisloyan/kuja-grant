# -*- coding: utf-8 -*-
"""Rotate every Proximate report_token (2026-07-09 RBAC remediation).

Context: before the RBAC hardening wave (Batches 0-2), the OB-only
disbursement/round detail endpoints returned `report_token` in their
payload to any logged-in user. A donor / platform-admin who fetched a
disbursement by id could read those bearer tokens. The leak is now closed
(non-OB responses strip report_token, and the detail endpoints 403 for
non-OB), but any token that was observed during the vulnerable window is
still valid. This script rotates them so a previously-observed value can no
longer be used.

What a report_token authorizes: submitting a disbursement / outcome report
via the token link (/proximate-report?t= , /proximate-outcome?t=). It does
NOT read sensitive data or move funds. Rotating INVALIDATES any outstanding
report-submission link that was already shared with a partner — the OB must
re-share the fresh link. On the demo/UAT tenant that is harmless.

Scope: all non-null report_tokens on ProximateDisbursement and
ProximateOutcomeAttestation for the Proximate network. The partner
mini-portal token is a separate per-partner credential and is left alone.

Usage (local):   py -3 scripts/rotate_proximate_report_tokens.py
Usage (prod):    railway run --service web py scripts/rotate_proximate_report_tokens.py
Add --dry-run to only count what would rotate.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.extensions import db
from app.models import (
    Network, ProximateDisbursement, ProximateOutcomeAttestation,
)

DRY_RUN = '--dry-run' in sys.argv


def main():
    app = create_app()
    with app.app_context():
        net = Network.query.filter_by(slug='proximate').first()
        if not net:
            print('No Proximate network found — nothing to rotate.')
            return 0

        disb = (
            ProximateDisbursement.query
            .filter(ProximateDisbursement.network_id == net.id)
            .filter(ProximateDisbursement.report_token.isnot(None))
            .all()
        )
        # ProximateOutcomeAttestation is scoped by partner, which is scoped
        # by network; filter via the partner relationship's network_id.
        outcomes = (
            ProximateOutcomeAttestation.query
            .filter(ProximateOutcomeAttestation.report_token.isnot(None))
            .all()
        )
        outcomes = [
            o for o in outcomes
            if getattr(o, 'network_id', None) == net.id
            or (getattr(o, 'partner', None) is not None
                and o.partner.network_id == net.id)
        ]

        print(f'Proximate network id={net.id}')
        print(f'  disbursements with a report_token: {len(disb)}')
        print(f'  outcome attestations with a report_token: {len(outcomes)}')

        if DRY_RUN:
            print('\n--dry-run: no changes written.')
            return 0

        rotated = 0
        for d in disb:
            d.report_token = ProximateDisbursement.make_report_token()
            rotated += 1
        for o in outcomes:
            o.report_token = ProximateOutcomeAttestation.make_report_token()
            rotated += 1

        db.session.commit()
        print(f'\nRotated {rotated} report_token(s). '
              'Outstanding report links are now invalid; re-share fresh ones.')
        return 0


if __name__ == '__main__':
    sys.exit(main())
